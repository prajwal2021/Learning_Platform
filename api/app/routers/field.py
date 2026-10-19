import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Learner, Page
from ..security import current_learner

router = APIRouter(prefix="/api/field", tags=["field view"])


@router.get("")
def field(response: Response, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    """The Field view page: its markup and its scripts, only for signed-in learners."""
    response.headers["Cache-Control"] = "private, no-store"
    html, scripts = db.get(Page, "field.html"), db.get(Page, "field.scripts")
    if html is None or scripts is None:
        raise HTTPException(404, "not loaded")
    return {"html": html.html, "scripts": json.loads(scripts.html)}
