"""The signed-in learner: their profile, and one overview of their progress everywhere (the home page)."""
import html
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import activity
from ..cache import cached
from ..db import get_db
from ..models import (Challenge, ChallengeStep, Guide, IqQuestion, IqTopic, Lab, Learner, LearnerState, Lesson,
                      LessonSlide, PathStep, PathUnit, Workbook)
from ..security import EMAIL, check_password, current_learner, hash_password, name_key, normalize_email
from .auth import profile

router = APIRouter(prefix="/api/me", tags=["me"])


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@router.patch("")
def update(body: ProfileIn, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Enter a name.")
    if learner.access_code_id is not None and not learner.email:
        # for access-code learners the name is how they sign in on another device, so it stays as entered
        raise HTTPException(409, "Add an email and password first. Your name is how an access code finds your progress.")
    learner.name, learner.name_key = name, name_key(name)
    db.commit()
    return profile(db, learner)


class CredentialsIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    current_password: str = Field(default="", max_length=200)


@router.put("/credentials")
def credentials(body: CredentialsIn, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    """Adds an email and password to an account, or changes them. Access-code learners use this to keep their progress
    when codes are retired."""
    if learner.password_hash and not check_password(body.current_password, learner.password_hash):
        raise HTTPException(403, "Your current password is not right.")
    email = normalize_email(body.email)
    if not EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    other = db.scalar(select(Learner.id).where(Learner.email == email, Learner.id != learner.id))
    if other:
        raise HTTPException(409, "Another account already uses that email.")
    learner.email, learner.password_hash = email, hash_password(body.password)
    db.commit()
    return profile(db, learner)


def _steps_of(unit_html: str) -> dict[str, dict]:
    """The text and link of each step, read from the unit's markup (the same markup the Learning Path page shows)."""
    out = {}
    for m in re.finditer(r'<li class="step"[^>]*data-step="([^"]+)"(.*?)</li>', unit_html, re.S):
        body = m.group(2)
        text = re.search(r'class="stext"[^>]*>(.*?)</span>', body, re.S)
        kind = re.search(r'class="kind[^"]*"[^>]*>(.*?)</span>', body, re.S)
        go = re.search(r'<a class="go" href="([^"]+)"[^>]*>(.*?)</a>', body, re.S)
        strip = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()  # noqa: E731
        out[m.group(1)] = {"text": strip(text.group(1)) if text else "", "kind": strip(kind.group(1)) if kind else "",
                           "href": go.group(1) if go else None, "link": strip(go.group(2)) if go else None}
    return out


def _content(db: Session) -> dict:
    """Everything the overview needs that comes from content alone, computed once per cache period."""
    steps: dict[str, list[PathStep]] = {}
    for s in db.scalars(select(PathStep).order_by(PathStep.ord)):
        steps.setdefault(s.unit_num, []).append(s)
    units = [{"num": u.num, "name": u.name, "status": u.status, "steps": _steps_of(u.html),
              "required": [s.id for s in steps.get(u.num, []) if not s.optional]}
             for u in db.scalars(select(PathUnit).order_by(PathUnit.ord))]
    labs = [{"id": l.id, "kicker": l.meta.get("kicker"), "name": l.meta.get("name"), "time": l.meta.get("time"),
             "blurb": l.meta.get("blurb"), "items": list(l.items)} for l in db.scalars(select(Lab).order_by(Lab.ord))]
    counts = dict(db.execute(select(ChallengeStep.challenge_slug, func.count()).group_by(ChallengeStep.challenge_slug)).all())
    challenges = [{"slug": c.slug, "title": c.title, "difficulty": c.difficulty, "est_minutes": c.est_minutes, "tags": c.tags,
                   "scenario": c.scenario, "steps_total": counts.get(c.slug, 0)}
                  for c in db.scalars(select(Challenge).where(Challenge.status == "published").order_by(Challenge.ord))]
    slides = dict(db.execute(select(LessonSlide.lesson_slug, func.count()).group_by(LessonSlide.lesson_slug)).all())
    return {
        "units": units, "labs": labs, "challenges": challenges,
        "topics": [{"slug": t.slug, "name": t.name, "category": t.category} for t in db.scalars(select(IqTopic).order_by(IqTopic.ord))],
        "qcount": dict(db.execute(select(IqQuestion.topic_slug, func.count()).group_by(IqQuestion.topic_slug)).all()),
        # columns only: a workbook row also holds its whole page
        "workbooks": [{"slug": s, "stage": st, "title": t, "companion": c}
                      for s, st, t, c in db.execute(select(Workbook.slug, Workbook.stage, Workbook.title, Workbook.companion).order_by(Workbook.ord))],
        "lessons": [{"slug": l.slug, "stage": l.stage, "title": l.title, "slides": slides.get(l.slug, 0)}
                    for l in db.scalars(select(Lesson).order_by(Lesson.ord))],
        "guides": db.scalar(select(func.count()).select_from(Guide)),
    }


@router.get("/overview")
def overview(response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    states: dict[str, dict] = {}
    for s in db.scalars(select(LearnerState).where(LearnerState.learner_id == learner.id)):
        states.setdefault(s.namespace, {})[s.key] = s.value

    c = cached("overview.content", lambda: _content(db))

    # learning path
    done = (states.get("path", {}).get("done") or {})
    unit_rows, nxt, total, count = [], None, 0, 0
    for u in c["units"]:
        req = u["required"]
        d = sum(1 for s in req if done.get(s))
        total, count = total + len(req), count + d
        unit_rows.append({"num": u["num"], "name": u["name"], "status": u["status"], "done": d, "total": len(req)})
        if nxt is None:
            first = next((s for s in req if not done.get(s)), None)
            if first:
                nxt = {"unit": u["num"], "unit_name": u["name"], "step": first, **u["steps"].get(first, {})}

    # labs on the Stack Map page: ticks are kept as done.<lab id> in the stackmap namespace
    sm = states.get("stackmap", {})
    labs = []
    for lab in c["labs"]:
        ticks = sm.get(f"done.{lab['id']}") or {}
        d = sum(1 for k in lab["items"] if isinstance(ticks, dict) and ticks.get(k))
        labs.append({k: v for k, v in lab.items() if k != "items"} | {"done": d, "total": len(lab["items"])})

    # challenges
    cst = states.get("challenges", {})
    cards = []
    for ch in c["challenges"]:
        t, cur = ch["steps_total"], (cst.get(ch["slug"]) or {}).get("current", 0)
        cards.append(ch | {"steps_done": min(cur, t), "status": "completed" if t and cur >= t else ("in_progress" if cur else "new")})
    today_card = cards[datetime.now(timezone.utc).date().toordinal() % len(cards)] if cards else None

    # interview questions
    iq = states.get("interview", {})
    topics, qcount = c["topics"], c["qcount"]
    cats: dict[str, dict] = {}
    known = review = 0
    touched = []
    for t in topics:
        n = qcount.get(t["slug"], 0)
        if not n:
            continue
        m = iq.get(t["slug"]) or {}
        k, r = sum(1 for v in m.values() if v == "known"), sum(1 for v in m.values() if v == "review")
        known, review = known + k, review + r
        cat = cats.setdefault(t["category"], {"name": t["category"], "topics": 0, "questions": 0, "known": 0})
        cat["topics"] += 1
        cat["questions"] += n
        cat["known"] += k
        if m:
            touched.append({"slug": t["slug"], "name": t["name"], "category": t["category"], "known": k, "review": r, "total": n})
    touched.sort(key=lambda x: -(x["known"] + x["review"]))

    # Core Build workbooks and lessons
    wst = states.get("workbook", {})
    wbs = []
    for w in c["workbooks"]:
        v = wst.get(w["slug"]) or {}
        wbs.append(w | {"visited": v.get("visited"), "saved": len(v.get("ls") or {})})
    last_wb = max((w for w in wbs if w["visited"]), key=lambda w: w["visited"], default=None)
    lst = states.get("lesson", {})
    lessons = [l | {"at": (lst.get(l["slug"]) or {}).get("slide", 0), "done": bool((lst.get(l["slug"]) or {}).get("done"))}
               for l in c["lessons"]]

    return {
        "user": profile(db, learner),
        "path": {"done": count, "total": total, "next": nxt, "units": unit_rows},
        "labs": {"done": sum(l["done"] for l in labs), "total": sum(l["total"] for l in labs), "items": labs},
        "challenges": {"total": len(cards), "completed": sum(1 for c in cards if c["status"] == "completed"),
                       "in_progress": [c for c in cards if c["status"] == "in_progress"][:3], "today": today_card},
        "interview": {"topics": sum(c["topics"] for c in cats.values()), "questions": sum(qcount.values()),
                      "known": known, "review": review, "categories": list(cats.values()), "recent": touched[:6]},
        "workbooks": {"total": len(wbs), "visited": sum(1 for w in wbs if w["visited"]), "last": last_wb, "items": wbs},
        "lessons": lessons,
        "guides": c["guides"],
        "activity": activity.summary(db, learner),
    }
