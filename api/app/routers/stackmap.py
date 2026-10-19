from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Lab, LabAsset, LabExplain, LabExplainUse, LabTab, Learner,
                      MapEdge, MapNode, MapPlane, MapRoute, Misc, Page, Resource)
from ..security import current_learner

router = APIRouter(prefix="/api/stackmap", tags=["stack map and labs"])


@router.get("/bootstrap")
def bootstrap(response: Response, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    """Everything the page needs to draw itself, except lab bodies (those load per lab)."""
    response.headers["Cache-Control"] = "private, no-store"
    labs = db.scalars(select(Lab).order_by(Lab.ord)).all()
    misc = {m.key: m.data for m in db.scalars(select(Misc))}
    ordered = lambda model: db.scalars(select(model).order_by(model.ord)).all()  # noqa: E731
    return {
        "html": db.get(Page, "stackmap.shell").html,
        "resources": {r.key: [r.title, r.descr, r.url] for r in db.scalars(select(Resource))},
        "nodes": {n.id: n.data for n in ordered(MapNode)},
        "edges": [e.data for e in ordered(MapEdge)],
        "routes": {r.id: r.data for r in ordered(MapRoute)},
        "planes": {p.id: p.data for p in ordered(MapPlane)},
        "plane_order": misc["plane_order"],
        "planned_labs": misc["planned_labs"],
        "explain_shared": misc["explain_shared"],
        "lab_order": [lab.id for lab in labs],
        "labs": {lab.id: {**lab.meta, "items": lab.items} for lab in labs},
    }


@router.get("/labs/{lab_id}")
def lab(lab_id: str, response: Response, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    """One lab: every tab, its project files and setup script, and the Explain panels its commands use."""
    response.headers["Cache-Control"] = "private, no-store"
    row = db.get(Lab, lab_id)
    if row is None:
        raise HTTPException(404, "no such lab")
    asset = db.get(LabAsset, row.asset_id) if row.asset_id else None
    tabs = db.scalars(select(LabTab).where(LabTab.lab_id == lab_id).order_by(LabTab.ord)).all()
    explain = db.scalars(
        select(LabExplain).join(LabExplainUse, LabExplainUse.xi == LabExplain.xi).where(LabExplainUse.lab_id == lab_id)
    ).all()
    return {
        "body": {t.tab_key: t.body for t in tabs},
        "files": asset.files if asset else None, "setup": asset.setup if asset else None,
        "folder": asset.folder if asset else None, "filesui": asset.filesui if asset else None,
        "explain": {str(e.xi): e.data for e in explain},
    }
