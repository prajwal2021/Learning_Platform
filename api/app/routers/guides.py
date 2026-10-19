import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Guide, GuideAsset, Learner
from ..security import current_learner

router = APIRouter(prefix="/api/guides", tags=["guides"])


@router.get("")
def list_guides(response: Response, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    return [{"slug": g.slug, "eyebrow": g.eyebrow, "title": g.title, "subtitle": g.subtitle}
            for g in db.scalars(select(Guide).order_by(Guide.ord))]


@router.get("/{slug}")
def get_guide(slug: str, response: Response, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    g = db.get(Guide, slug)
    if g is None:
        raise HTTPException(404, "no such guide")
    # the table of contents is built from the headings, so it always matches the text
    toc = [{"level": int(m.group(1)), "id": m.group(2), "text": re.sub(r"<[^>]+>", "", m.group(3))}
           for m in re.finditer(r'<h([12]) id="([^"]+)">(.*?)</h\1>', g.html)]
    return {"slug": g.slug, "eyebrow": g.eyebrow, "title": g.title, "subtitle": g.subtitle, "source": g.source,
            "html": g.html, "toc": toc}


@router.get("/{slug}/assets/{name}")
def asset(slug: str, name: str, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    a = db.get(GuideAsset, (slug, name))
    if a is None:
        raise HTTPException(404, "no such image")
    return Response(a.data, media_type=a.content_type, headers={"Cache-Control": "private, max-age=3600"})
