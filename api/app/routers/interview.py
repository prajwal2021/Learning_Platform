from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .. import activity
from ..cache import cached
from ..db import get_db
from ..models import IqFlag, IqQuestion, IqTopic, Learner, LearnerState
from ..security import current_learner

router = APIRouter(prefix="/api/interview", tags=["interview questions"])
NS = "interview"
LEVELS = ("basic", "intermediate", "advanced")


def _marks(db: Session, learner: Learner, slug: str) -> dict:
    row = db.get(LearnerState, (learner.id, NS, slug))
    return row.value if row else {}


@router.get("/topics")
def topics(response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    def count_all() -> dict:
        counts: dict = {}
        for slug, level, n in db.execute(select(IqQuestion.topic_slug, IqQuestion.level, func.count()).group_by(
                IqQuestion.topic_slug, IqQuestion.level)):
            counts.setdefault(slug, {})[level] = n
        return counts
    counts = cached("interview.counts", count_all)
    known = {s.key: sum(1 for v in s.value.values() if v == "known") for s in db.scalars(select(LearnerState).where(
        LearnerState.learner_id == learner.id, LearnerState.namespace == NS))}
    out = []
    for t in db.scalars(select(IqTopic).order_by(IqTopic.ord)):
        c = counts.get(t.slug)
        if c:  # topics with no questions yet are not listed
            out.append({"slug": t.slug, "name": t.name, "category": t.category,
                        "counts": {lv: c.get(lv, 0) for lv in LEVELS}, "known": known.get(t.slug, 0)})
    return out


@router.get("/topics/{slug}")
def topic(slug: str, response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    t = db.get(IqTopic, slug)
    if t is None:
        raise HTTPException(404, "no such topic")
    rows = db.scalars(select(IqQuestion).where(IqQuestion.topic_slug == slug).order_by(IqQuestion.ord)).all()
    if not rows:
        raise HTTPException(404, "no such topic")
    return {
        "slug": t.slug, "name": t.name, "category": t.category,
        "questions": [{"id": q.id, "level": q.level, "question": q.question, "answer": q.answer,
                       "real_world": q.real_world, "code_lang": q.code_lang, "code": q.code,
                       "follow_up": q.follow_up} for q in rows],
        "marks": _marks(db, learner, slug),
    }


class Mark(BaseModel):
    question_id: str = Field(min_length=4, max_length=16)
    mark: str | None = Field(default=None, pattern=r"^(known|review)$")


@router.put("/topics/{slug}/marks")
def mark(slug: str, body: Mark, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    q = db.get(IqQuestion, body.question_id)
    if q is None or q.topic_slug != slug:
        raise HTTPException(404, "no such question")
    marks = dict(_marks(db, learner, slug))
    if body.mark is None:
        marks.pop(body.question_id, None)
    else:
        marks[body.question_id] = body.mark
    stmt = insert(LearnerState).values(learner_id=learner.id, namespace=NS, key=slug, value=marks)
    db.execute(stmt.on_conflict_do_update(index_elements=["learner_id", "namespace", "key"], set_={"value": stmt.excluded.value}))
    activity.record(db, learner)
    db.commit()
    return {"ok": True}


class Flag(BaseModel):
    note: str = Field(default="", max_length=1000)


@router.post("/questions/{question_id}/flag")
def flag(question_id: str, body: Flag, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    if db.get(IqQuestion, question_id) is None:
        raise HTTPException(404, "no such question")
    db.add(IqFlag(question_id=question_id, learner_id=learner.id, note=body.note.strip()))
    db.commit()
    return {"ok": True}
