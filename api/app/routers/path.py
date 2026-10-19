from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Learner, Page, PathUnit
from ..security import current_learner

router = APIRouter(prefix="/api/path", tags=["learning path"])


@router.get("")
def learning_path(response: Response, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    """The Learning Path page: the frame, with every unit slotted in at <!--UNITS-->."""
    response.headers["Cache-Control"] = "private, no-store"
    units = db.scalars(select(PathUnit).order_by(PathUnit.ord)).all()
    shell = db.get(Page, "path.shell").html
    return {"html": shell.replace("<!--UNITS-->", "\n".join(u.html for u in units))}
