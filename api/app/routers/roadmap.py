"""The roadmap as a graph: every unit, lab, Core Build stage and system component, how they connect, and how far the
learner has got in each. The web app lays it out and draws it."""
import re

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Lab, Learner, LearnerState, Lesson, LessonSlide, MapNode, Misc, PathStep, PathUnit, Workbook
from ..security import current_learner

router = APIRouter(prefix="/api/roadmap", tags=["roadmap"])

# Planned units name their topic but not yet their lab; these are the labs on the same topic (by the labs' own names).
UNIT_LABS_BY_TOPIC = {
    "3": [3], "4": [4], "5": [5], "6": [6, 7, 8], "7": [9, 10], "8": [11], "9": [15, 16], "10": [17], "11": [18, 19],
    "12": [20], "13": [21], "E": list(range(22, 32)),
}


def _status(done: int, total: int, planned: bool = False) -> str:
    if planned:
        return "planned"
    if total and done >= total:
        return "done"
    return "in_progress" if done else "available"


@router.get("")
def roadmap(response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    st: dict[str, dict] = {}
    for s in db.scalars(select(LearnerState).where(LearnerState.learner_id == learner.id)):
        st.setdefault(s.namespace, {})[s.key] = s.value
    nodes, edges = [], []

    def edge(a, b, kind):
        edges.append({"id": f"{a}->{b}", "source": a, "target": b, "kind": kind})

    # Core Build: ten stages in order, each with its workbooks and lessons
    wst, lst = st.get("workbook", {}), st.get("lesson", {})
    wbs = db.scalars(select(Workbook).order_by(Workbook.ord)).all()
    slides = dict(db.execute(select(LessonSlide.lesson_slug, func.count()).group_by(LessonSlide.lesson_slug)).all())
    lessons = db.scalars(select(Lesson).order_by(Lesson.ord)).all()
    for stage in sorted({w.stage for w in wbs}):
        mine = [w for w in wbs if w.stage == stage]
        visited = sum(1 for w in mine if (wst.get(w.slug) or {}).get("visited"))
        main = next((w for w in mine if not w.companion), mine[0])
        nodes.append({"id": f"stage-{stage}", "lane": "core", "order": stage - 1, "kicker": f"Stage {stage}", "label": main.title,
                      "blurb": main.summary, "status": _status(visited, len(mine)), "progress": [visited, len(mine)],
                      "href": f"/core-build/{main.slug}",
                      "children": [{"label": w.title, "href": f"/core-build/{w.slug}", "kind": "workbook",
                                    "visited": bool((wst.get(w.slug) or {}).get("visited"))} for w in mine]
                                  + [{"label": f"Lesson: {l.title}", "href": f"/core-build/lessons/{l.slug}", "kind": "lesson",
                                      "visited": bool(lst.get(l.slug))} for l in lessons if l.stage == stage]})
        if stage > 1:
            edge(f"stage-{stage - 1}", f"stage-{stage}", "next")

    # Learning Path units
    done = (st.get("path", {}).get("done") or {})
    steps: dict[str, list] = {}
    for s in db.scalars(select(PathStep)):
        if not s.optional:
            steps.setdefault(s.unit_num, []).append(s.id)
    units = db.scalars(select(PathUnit).order_by(PathUnit.ord)).all()
    unit_labs: dict[str, set[int]] = {}
    for i, u in enumerate(units):
        ids = steps.get(u.num, [])
        d = sum(1 for x in ids if done.get(x))
        where = re.search(r"<dt>Where</dt><dd>(.*?)</dd>", u.html, re.S)
        named = {int(n) for n in re.findall(r"Lab (\d+)", where.group(1))} if where else set()
        unit_labs[u.num] = named or set(UNIT_LABS_BY_TOPIC.get(u.num, []))
        name = u.name.split(":")[0]
        nodes.append({"id": f"unit-{u.num}", "lane": "path", "order": i, "kicker": "Electives" if u.num == "E" else f"Unit {u.num}",
                      "label": name, "blurb": u.name, "status": _status(d, len(ids), u.status == "planned" and not d),
                      "progress": [d, len(ids)], "href": f"/path#unit-{u.num}", "built": u.status == "built"})
        if i:
            edge(f"unit-{units[i - 1].num}", f"unit-{u.num}", "next")

    # labs, built and planned
    sm = st.get("stackmap", {})
    lab_by_num: dict[int, str] = {}
    for lab in db.scalars(select(Lab).order_by(Lab.ord)):
        num = int(re.sub(r"\D", "", lab.meta.get("kicker", "")) or 0)
        ticks = sm.get(f"done.{lab.id}") or {}
        d = sum(1 for k in lab.items if isinstance(ticks, dict) and ticks.get(k))
        nid = f"lab-{lab.id}"
        lab_by_num[num] = nid
        nodes.append({"id": nid, "lane": "labs", "order": num, "kicker": lab.meta.get("kicker"), "label": lab.meta.get("name"),
                      "blurb": lab.meta.get("blurb"), "status": _status(d, len(lab.items)), "progress": [d, len(lab.items)],
                      "href": f"/stack-map#lab-{lab.id}", "time": lab.meta.get("time"), "covers": lab.meta.get("covers", [])})
    planned = db.get(Misc, "planned_labs")
    for p in (planned.data if planned else []):
        num = int(re.sub(r"\D", "", p.get("kicker", "")) or 0)
        nid = f"plab-{num}"
        lab_by_num[num] = nid
        nodes.append({"id": nid, "lane": "labs", "order": num, "kicker": p.get("kicker"), "label": p.get("name"),
                      "blurb": p.get("blurb"), "status": "planned", "progress": [0, 0], "href": None, "covers": p.get("covers", [])})
    for u, nums in unit_labs.items():
        for n in sorted(nums):
            if n in lab_by_num:
                edge(f"unit-{u}", lab_by_num[n], "uses")

    # system components on the Stack Map, and which labs practise them
    comps = db.scalars(select(MapNode).order_by(MapNode.ord)).all()
    practised: dict[str, list[str]] = {}
    for n in nodes:
        for c in n.get("covers") or []:
            practised.setdefault(c, []).append(n["id"])
    for i, c in enumerate(comps):
        labs_here = practised.get(c.id, [])
        built = [x for x in labs_here if x.startswith("lab-")]
        done_labs = sum(1 for x in built if next(n for n in nodes if n["id"] == x)["status"] == "done")
        nodes.append({"id": f"comp-{c.id}", "lane": "system", "order": i, "kicker": c.data.get("layer"), "label": c.data.get("name"),
                      "blurb": re.sub(r"<[^>]+>", "", c.data.get("what", ""))[:400], "status": _status(done_labs, len(built), not built),
                      "progress": [done_labs, len(built)], "href": f"/stack-map#{c.data['plane']}" if c.data.get("plane") else "/stack-map"})
        for x in labs_here:
            edge(x, f"comp-{c.id}", "covers")

    lanes = [
        {"id": "core", "label": "Core Build", "blurb": "Ten stages from written requirements to an application in production."},
        {"id": "path", "label": "Learning Path", "blurb": "The order to follow, one unit at a time."},
        {"id": "labs", "label": "Hands-on labs", "blurb": "Run the stack on your machine, break it, and fix it."},
        {"id": "system", "label": "System components", "blurb": "The boxes you draw in a system design interview."},
    ]
    return {"lanes": lanes, "nodes": nodes, "edges": edges}
