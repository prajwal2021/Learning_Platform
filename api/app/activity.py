"""One row per learner per day that counts what they did. Called from the routes that save progress."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import Learner, LearnerActivity


def today() -> date:
    return datetime.now(timezone.utc).date()


def record(db: Session, learner: Learner) -> None:
    """Adds one to today's count. The caller commits."""
    stmt = insert(LearnerActivity).values(learner_id=learner.id, day=today(), n=1)
    db.execute(stmt.on_conflict_do_update(index_elements=["learner_id", "day"], set_={"n": LearnerActivity.n + 1}))


def summary(db: Session, learner: Learner, days: int = 371) -> dict:
    since = today() - timedelta(days=days - 1)
    rows = {r.day: r.n for r in db.scalars(select(LearnerActivity).where(
        LearnerActivity.learner_id == learner.id, LearnerActivity.day >= since))}
    # the streak counts back from today, or from yesterday when nothing is done yet today
    d, streak = today(), 0
    if d not in rows:
        d -= timedelta(days=1)
    while d in rows:
        streak += 1
        d -= timedelta(days=1)
    best = run = 0
    prev = None
    for day in sorted(rows):
        run = run + 1 if prev and day - prev == timedelta(days=1) else 1
        best, prev = max(best, run), day
    return {"days": {d.isoformat(): n for d, n in rows.items()}, "streak": streak, "best_streak": best,
            "active_days": len(rows), "today": today().isoformat()}
