"""One search box over everything: technologies, interview questions, challenges, labs, workbooks, guides, path units."""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Challenge, Guide, IqQuestion, IqTopic, Lab, Learner, Lesson, PathUnit, Workbook
from ..security import current_learner

router = APIRouter(prefix="/api/search", tags=["search"])


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


@router.get("")
def search(response: Response, q: str = Query(min_length=2, max_length=80), _: Learner = Depends(current_learner),
           db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    p = _like(q.strip())
    out = []
    for t in db.scalars(select(IqTopic).where(IqTopic.name.ilike(p)).order_by(IqTopic.ord).limit(6)):
        out.append({"type": "topic", "title": t.name, "subtitle": f"Interview questions · {t.category}", "href": f"/interview/{t.slug}"})
    for w in db.scalars(select(Workbook).where(or_(Workbook.title.ilike(p), Workbook.summary.ilike(p))).order_by(Workbook.ord).limit(5)):
        out.append({"type": "workbook", "title": w.title, "subtitle": f"Core Build · Stage {w.stage} workbook", "href": f"/core-build/{w.slug}"})
    for l in db.scalars(select(Lesson).where(Lesson.title.ilike(p)).limit(3)):
        out.append({"type": "lesson", "title": l.title, "subtitle": f"Stage {l.stage} lesson", "href": f"/core-build/lessons/{l.slug}"})
    for c in db.scalars(select(Challenge).where(Challenge.status == "published", or_(Challenge.title.ilike(p), Challenge.scenario.ilike(p)))
                        .order_by(Challenge.ord).limit(6)):
        out.append({"type": "challenge", "title": c.title, "subtitle": f"Challenge · {c.difficulty} · {c.est_minutes} min", "href": f"/challenges/{c.slug}"})
    for lab in db.scalars(select(Lab).order_by(Lab.ord)):
        if q.lower() in (lab.meta.get("name", "") + " " + lab.meta.get("blurb", "")).lower():
            out.append({"type": "lab", "title": lab.meta.get("name"), "subtitle": f"{lab.meta.get('kicker')} · Stack Map and Labs",
                        "href": f"/stack-map#lab-{lab.id}"})
    for u in db.scalars(select(PathUnit).where(PathUnit.name.ilike(p)).order_by(PathUnit.ord).limit(4)):
        out.append({"type": "unit", "title": u.name, "subtitle": f"Learning Path · {'Unit ' + u.num if u.num != 'E' else 'Electives'}",
                    "href": f"/path#unit-{u.num}"})
    for g in db.scalars(select(Guide).where(or_(Guide.title.ilike(p), Guide.subtitle.ilike(p))).order_by(Guide.ord).limit(3)):
        out.append({"type": "guide", "title": g.title, "subtitle": f"Guide · {g.eyebrow}", "href": f"/guides/{g.slug}"})
    rows = db.execute(select(IqQuestion.question, IqQuestion.topic_slug, IqQuestion.level, IqTopic.name)
                      .join(IqTopic, IqTopic.slug == IqQuestion.topic_slug).where(IqQuestion.question.ilike(p)).limit(8)).all()
    for question, slug, level, name in rows:
        out.append({"type": "question", "title": question, "subtitle": f"{name} · {level}",
                    "href": f"/interview/{slug}?level={level}&q={q.strip()}"})
    return out
