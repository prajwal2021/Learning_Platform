"""Load the content in api/seed/*.json into PostgreSQL. Safe to run again: it replaces content, never touches progress."""
import hashlib
import json
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from . import models as m
from .config import settings
from . import migrate
from .db import engine


def run() -> dict:
    migrate.run()
    seed = Path(settings.seed_dir)
    path = json.loads((seed / "path.json").read_text())
    sm = json.loads((seed / "stackmap.json").read_text())

    with Session(engine) as db:
        for model in (m.LabExplainUse, m.LabExplain, m.LabTab, m.Lab, m.LabAsset, m.Misc, m.MapPlane, m.MapRoute,
                      m.MapEdge, m.MapNode, m.Resource, m.PathStep, m.PathUnit, m.Page):
            db.execute(delete(model))

        db.add(m.Page(key="path.shell", html=path["shell"]))
        db.add(m.Page(key="stackmap.shell", html=sm["pages"][0]["html"]))
        db.add_all(m.PathUnit(num=u["num"], ord=u["ord"], name=u["name"], status=u["status"],
                              open_by_default=u["open"], html=u["html"]) for u in path["units"])
        db.flush()
        db.add_all(m.PathStep(id=s["id"], unit_num=s["unit"], ord=s["ord"], optional=s["optional"]) for s in path["steps"])

        db.add_all(m.Resource(**r) for r in sm["resources"])
        db.add_all(m.MapNode(**r) for r in sm["nodes"])
        db.add_all(m.MapEdge(**r) for r in sm["edges"])
        db.add_all(m.MapRoute(**r) for r in sm["routes"])
        db.add_all(m.MapPlane(**r) for r in sm["planes"])
        db.add_all([
            m.Misc(key="plane_order", data=sm["plane_order"]),
            m.Misc(key="planned_labs", data=sm["planned_labs"]),
            m.Misc(key="explain_shared", data=sm["explain_shared"]),
        ])
        db.add_all(m.LabAsset(**a) for a in sm["assets"])
        db.add_all(m.LabExplain(**e) for e in sm["explain"])
        db.flush()
        for lab in sm["labs"]:
            db.add(m.Lab(id=lab["id"], ord=lab["ord"], meta=lab["meta"], items=lab["items"], asset_id=lab["asset_id"]))
        db.flush()
        for lab in sm["labs"]:
            db.add_all(m.LabTab(lab_id=lab["id"], **t) for t in lab["tabs"])
            db.add_all(m.LabExplainUse(lab_id=lab["id"], xi=xi) for xi in lab["xis"])
        # challenges: replace the content only; progress rows (learner_state) are kept
        db.execute(delete(m.ChallengeStep)); db.execute(delete(m.Challenge))
        files = sorted((seed / "challenges").glob("*.json")) if (seed / "challenges").exists() else []
        docs = [json.loads(f.read_text()) for f in files]
        reviewed = json.loads((seed / "challenge_review.json").read_text()) if (seed / "challenge_review.json").exists() else {}
        order = {t["slug"]: i for i, t in enumerate(json.loads((seed / "challenge_topics.json").read_text()))}
        for d in sorted(docs, key=lambda d: order.get(d["slug"], 999)):
            db.add(m.Challenge(slug=d["slug"], ord=order.get(d["slug"], 999), status="draft" if d.get("review_issues") and d["slug"] not in reviewed.get("publish", []) else "published", title=d["title"],
                               difficulty=d["difficulty"], est_minutes=d["est_minutes"], tags=d["tags"],
                               scenario=d["scenario"], goal=d["goal"], takeaway=d["takeaway"], concepts=d["concepts"]))
        db.flush()
        for d in docs:
            db.add_all(m.ChallengeStep(challenge_slug=d["slug"], ord=i, title=s["title"], question=s["question"],
                                       concept_keys=s["concept_keys"], options=s["options"], explanation=s["explanation"])
                       for i, s in enumerate(d["steps"]))
        # field view: markup plus the page's scripts (stored as JSON text in one Page row each)
        ffile = seed / "field.json"
        if ffile.exists():
            f = json.loads(ffile.read_text())
            db.add(m.Page(key="field.html", html=f["html"]))
            db.add(m.Page(key="field.scripts", html=json.dumps(f["scripts"])))
        # guides (long documents) and their images
        db.execute(delete(m.GuideAsset)); db.execute(delete(m.Guide))
        gfile = seed / "guides.json"
        n_guides = 0
        if gfile.exists():
            for g in json.loads(gfile.read_text())["guides"]:
                db.add(m.Guide(slug=g["slug"], ord=g["ord"], eyebrow=g["eyebrow"], title=g["title"], subtitle=g["subtitle"],
                               source=g["source"], html=g["html"]))
                db.flush()
                for img in sorted((seed / "guide-assets" / g["slug"]).glob("*")) if (seed / "guide-assets" / g["slug"]).exists() else []:
                    db.add(m.GuideAsset(guide_slug=g["slug"], name=img.name, content_type="image/" + img.suffix.lstrip(".").replace("jpg", "jpeg"),
                                        data=img.read_bytes()))
                n_guides += 1
        # interview questions
        db.execute(delete(m.IqQuestion)); db.execute(delete(m.IqTopic))
        n_questions = 0
        for i, t in enumerate(json.loads((seed / "interview_topics.json").read_text())):
            f = seed / "interview" / f"{t['slug']}.json"
            if not f.exists():
                continue
            d = json.loads(f.read_text())
            db.add(m.IqTopic(slug=t["slug"], ord=i, name=t["name"], category=t["category"]))
            db.flush()
            for level in ("basic", "intermediate", "advanced"):
                for j, q in enumerate(d["levels"].get(level, [])):
                    qid = hashlib.sha1(f"{t['slug']}|{level}|{q['question']}".encode()).hexdigest()[:12]
                    db.add(m.IqQuestion(id=qid, topic_slug=t["slug"], level=level, ord=j, question=q["question"],
                                        answer=q["answer"], real_world=q["real_world"], code_lang=q["code_lang"],
                                        code=q["code"], follow_up=q["follow_up"]))
                    n_questions += 1
        # Core Build: the stage workbooks (whole pages), their downloads, and the narrated lessons
        for model in (m.WorkbookFile, m.Workbook, m.LessonSlide, m.Lesson):
            db.execute(delete(model))
        n_workbooks = n_slides = 0
        wfile = seed / "workbooks.json"
        if wfile.exists():
            for w in json.loads(wfile.read_text()):
                db.add(m.Workbook(slug=w["slug"], ord=w["ord"], stage=w["stage"], title=w["title"], summary=w["summary"],
                                  companion=w["companion"], html=(seed / "workbooks" / f"{w['slug']}.html").read_text(encoding="utf-8")))
                db.flush()
                for f in w.get("files", []):
                    data = (seed / "workbook-files" / w["slug"] / f["name"]).read_bytes()
                    db.add(m.WorkbookFile(workbook_slug=w["slug"], name=f["name"], label=f["label"],
                                          content_type="application/zip" if f["name"].endswith(".zip") else "application/octet-stream", data=data))
                n_workbooks += 1
        lfile = seed / "lessons.json"
        if lfile.exists():
            for l in json.loads(lfile.read_text()):
                adir = seed / "lesson-assets" / l["slug"]
                db.add(m.Lesson(slug=l["slug"], ord=l["ord"], stage=l["stage"], title=l["title"], subtitle=l["subtitle"],
                                cover=(adir / l["cover"]).read_bytes() if l.get("cover") else None))
                db.flush()
                for s in l["slides"]:
                    db.add(m.LessonSlide(lesson_slug=l["slug"], n=s["n"], chapter=s["chapter"], narration=s["narration"],
                                         image=(adir / s["image"]).read_bytes()))
                    n_slides += 1
        db.commit()
    return {"workbooks": n_workbooks, "lesson_slides": n_slides, "guides": n_guides, "questions": n_questions, "challenges": len(docs), "drafts": sum(1 for d in docs if d.get("review_issues") and d["slug"] not in reviewed.get("publish", [])), "units": len(path["units"]), "steps": len(path["steps"]), "labs": len(sm["labs"]),
            "nodes": len(sm["nodes"]), "resources": len(sm["resources"])}
