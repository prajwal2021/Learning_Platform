"""Daily challenges. The answer key never leaves the server before an answer: the browser gets the question and the
options, and POST /answer returns whether the pick was right, a hint, or the reasoning."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .. import activity
from ..db import get_db
from ..models import Challenge, ChallengeStep, Learner, LearnerState
from ..security import current_learner

router = APIRouter(prefix="/api/challenges", tags=["daily challenges"])
NS = "challenges"


def _state(db: Session, learner: Learner, slug: str) -> dict:
    row = db.get(LearnerState, (learner.id, NS, slug))
    # current: index of the step being worked on; steps: {"0": {"attempts": n, "wrong": ["a"], "picked": "c"}}
    return row.value if row else {"current": 0, "steps": {}}


def _save(db: Session, learner: Learner, slug: str, value: dict) -> None:
    stmt = insert(LearnerState).values(learner_id=learner.id, namespace=NS, key=slug, value=value)
    db.execute(stmt.on_conflict_do_update(index_elements=["learner_id", "namespace", "key"], set_={"value": stmt.excluded.value}))
    db.commit()


def _published(db: Session, slug: str) -> Challenge:
    c = db.get(Challenge, slug)
    if c is None or c.status != "published":
        raise HTTPException(404, "no such challenge")
    return c


def _steps(db: Session, slug: str) -> list[ChallengeStep]:
    return list(db.scalars(select(ChallengeStep).where(ChallengeStep.challenge_slug == slug).order_by(ChallengeStep.ord)))


@router.get("")
def list_challenges(response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    rows = db.scalars(select(Challenge).where(Challenge.status == "published").order_by(Challenge.ord)).all()
    states = {s.key: s.value for s in db.scalars(select(LearnerState).where(
        LearnerState.learner_id == learner.id, LearnerState.namespace == NS))}
    counts = _count_steps(db)
    out = []
    for c in rows:
        total = counts.get(c.slug, 0)
        done = states.get(c.slug, {}).get("current", 0)
        out.append({
            "slug": c.slug, "title": c.title, "difficulty": c.difficulty, "est_minutes": c.est_minutes, "tags": c.tags,
            "scenario": c.scenario, "steps_total": total, "steps_done": min(done, total),
            "status": "completed" if total and done >= total else ("in_progress" if done else "new"),
        })
    return out


def _count_steps(db: Session) -> dict:
    return dict(db.execute(select(ChallengeStep.challenge_slug, func.count()).group_by(ChallengeStep.challenge_slug)).all())


@router.get("/{slug}")
def get_challenge(slug: str, response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    c = _published(db, slug)
    steps = _steps(db, slug)
    st = _state(db, learner, slug)
    cur = st["current"]
    shown = []
    for s in steps[: cur + 1]:  # steps after the current one are not sent
        entry = {"index": s.ord, "title": s.title, "question": s.question, "concept_keys": s.concept_keys,
                 "options": [{"id": o["id"], "text": o["text"]} for o in s.options]}
        prog = st["steps"].get(str(s.ord), {})
        entry["wrong"] = prog.get("wrong", [])
        if s.ord < cur:  # answered: the reasoning and the right option may be shown
            entry["correct"] = next(o["id"] for o in s.options if o["correct"])
            entry["explanation"] = s.explanation
            entry["attempts"] = prog.get("attempts", 1)
        else:
            entry["hints"] = {o["id"]: o["hint"] for o in s.options if o["id"] in entry["wrong"]}
        shown.append(entry)
    done = cur >= len(steps)
    # The glossary only lists topics the learner has met, so it cannot give away a step they have not reached.
    seen = {k for s in steps[: cur + 1] for k in s.concept_keys}
    first_used = {}
    for s in steps:
        for k in s.concept_keys:
            first_used.setdefault(k, s.ord)
    concepts = []
    for x in c.concepts:
        if x["key"] in seen:
            # what a topic does "in this problem" can spell out the answer, so it appears once the step that uses it is solved
            concepts.append(x if first_used[x["key"]] < cur else {k: v for k, v in x.items() if k != "used_here"})
    return {
        "slug": c.slug, "title": c.title, "difficulty": c.difficulty, "est_minutes": c.est_minutes, "tags": c.tags,
        "scenario": c.scenario, "goal": c.goal, "concepts": concepts,
        "steps_total": len(steps), "current": cur, "steps": shown,
        "takeaway": c.takeaway if done else None, "completed": done,
    }


class Answer(BaseModel):
    step: int = Field(ge=0)
    option: str = Field(min_length=1, max_length=1)


@router.post("/{slug}/answer")
def answer(slug: str, body: Answer, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    c = _published(db, slug)
    steps = _steps(db, slug)
    st = _state(db, learner, slug)
    if body.step != st["current"] or body.step >= len(steps):
        raise HTTPException(409, "that step is not the current one")
    step = steps[body.step]
    pick = next((o for o in step.options if o["id"] == body.option), None)
    if pick is None:
        raise HTTPException(422, "no such option")
    prog = st["steps"].setdefault(str(body.step), {"attempts": 0, "wrong": []})
    prog["attempts"] += 1
    activity.record(db, learner)
    if not pick["correct"]:
        if pick["id"] not in prog["wrong"]:
            prog["wrong"].append(pick["id"])
        _save(db, learner, slug, st)
        return {"correct": False, "hint": pick["hint"], "attempts": prog["attempts"]}
    st["current"] = body.step + 1
    _save(db, learner, slug, st)
    finished = st["current"] >= len(steps)
    return {"correct": True, "correct_option": pick["id"], "explanation": step.explanation, "attempts": prog["attempts"],
            "finished": finished, "takeaway": c.takeaway if finished else None}


@router.post("/{slug}/reset")
def reset(slug: str, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    _published(db, slug)
    _save(db, learner, slug, {"current": 0, "steps": {}})
    return {"ok": True}
