import json
import re

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .. import activity
from ..db import get_db
from ..models import Learner, LearnerState, PathStep
from ..security import current_learner

router = APIRouter(prefix="/api/state", tags=["progress"])
NAMESPACES = {"path", "stackmap", "workbook", "lesson"}
KEY = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")
MAX_BYTES = 64 * 1024
MAX_BYTES_NS = {"workbook": 1024 * 1024}  # a workbook keeps its filled-in worksheets and templates


def _check(ns: str, key: str | None = None) -> None:
    if ns not in NAMESPACES:
        raise HTTPException(404, "unknown namespace")
    if key is not None and not KEY.match(key):
        raise HTTPException(422, "bad key")


@router.get("/{ns}")
def read_all(ns: str, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    _check(ns)
    rows = db.scalars(select(LearnerState).where(LearnerState.learner_id == learner.id, LearnerState.namespace == ns))
    return {r.key: r.value for r in rows}


@router.put("/{ns}/{key}")
def write(ns: str, key: str, value=Body(..., embed=True), learner: Learner = Depends(current_learner),
          db: Session = Depends(get_db)):
    _check(ns, key)
    if len(json.dumps(value)) > MAX_BYTES_NS.get(ns, MAX_BYTES):
        raise HTTPException(413, "too large")
    if ns == "path" and key == "done":  # only real steps, only true
        known = set(db.scalars(select(PathStep.id)))
        if not isinstance(value, dict):
            raise HTTPException(422, "expected an object")
        value = {k: True for k, v in value.items() if k in known and v is True}
    stmt = insert(LearnerState).values(learner_id=learner.id, namespace=ns, key=key, value=value)
    db.execute(stmt.on_conflict_do_update(
        index_elements=["learner_id", "namespace", "key"], set_={"value": stmt.excluded.value}))
    # remembered settings (last tab, simulator choices) are not activity; ticks, workbook saves and lesson places are
    if ns != "stackmap" or key.startswith("done."):
        activity.record(db, learner)
    db.commit()
    return {"ok": True}


@router.delete("/{ns}")
def clear(ns: str, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    _check(ns)
    db.execute(delete(LearnerState).where(LearnerState.learner_id == learner.id, LearnerState.namespace == ns))
    db.commit()
    return {"ok": True}
