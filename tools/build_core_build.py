"""Builds the Core Build track from the Drive files in source-docs/:

    api/seed/workbooks.json + api/seed/workbooks/<slug>.html     the eleven stage workbooks (pages kept byte for byte)
    api/seed/workbook-files/<slug>/<name>                        downloads attached to a workbook (the Stage 5 project)
    api/seed/lessons.json + api/seed/lesson-assets/<slug>/       the Stage 1 video lesson: slides and their narration

    tools/.venv/bin/python tools/build_core_build.py
"""
import html
import json
import re
import shutil
from pathlib import Path

from docx_to_html import W, Doc

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source-docs"
SEED = ROOT / "api/seed"

# file in source-docs/workbooks -> (stage, title shown in the app). Titles are the workbooks' own headings.
WORKBOOKS = [
    ("stage-1-requirements", 1, "Gather the requirements"),
    ("stage-2-pick-the-stack", 2, "Pick the stack"),
    ("stage-3-settle-versions", 3, "Settle the versions"),
    ("stage-4-structure-backend", 4, "Structure the backend"),
    ("stage-4-working-in-git", 4, "Working in Git"),
    ("stage-5-skeleton", 5, "Build the skeleton"),
    ("stage-6-connect-front-end", 6, "Connect the front end"),
    ("stage-7-database", 7, "Build the database"),
    ("stage-8-load", 8, "Prepare for load"),
    ("stage-9-test-deploy", 9, "Test and deploy"),
    ("stage-10-operations", 10, "Operate after launch"),
]
ATTACHMENTS = {"stage-5-skeleton": [("user-notices-stage5.zip", "The User Notices project at the end of Stage 5")]}


def plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def summary(page: str) -> str:
    """The workbook's own opening paragraph: the first paragraph after the title that reads as a sentence."""
    body = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    h1 = re.search(r"<h1[^>]*>.*?</h1>", body, re.S)
    for p in re.findall(r"<p[^>]*>(.*?)</p>", body[h1.end():] if h1 else body, re.S):
        t = plain(p)
        if len(t) > 90 and "·" not in t[:40]:
            return t
    return ""


def workbooks():
    out_dir = SEED / "workbooks"
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)
    files_dir = SEED / "workbook-files"
    shutil.rmtree(files_dir, ignore_errors=True)
    items = []
    for i, (slug, stage, title) in enumerate(WORKBOOKS):
        page = (SRC / "workbooks" / f"{slug}.html").read_text(encoding="utf-8")
        (out_dir / f"{slug}.html").write_text(page, encoding="utf-8")
        attached = []
        for name, label in ATTACHMENTS.get(slug, []):
            (files_dir / slug).mkdir(parents=True, exist_ok=True)
            shutil.copy(SRC / name, files_dir / slug / name)
            attached.append({"name": name, "label": label})
        items.append({"slug": slug, "ord": i, "stage": stage, "title": title, "summary": summary(page),
                      "companion": slug == "stage-4-working-in-git", "files": attached})
        print(f"  {slug}: {len(page):,} chars")
    (SEED / "workbooks.json").write_text(json.dumps(items, indent=1, ensure_ascii=False))
    return len(items)


def lesson():
    kit = SRC / "stage-1-video-kit"
    d = Doc(kit / "narration.docx")
    paras = [c for c in d.root.find(W + "body") if c.tag == W + "p"]
    text = lambda p: "".join(t.text or "" for t in p.iter(W + "t")).strip()
    narration, cur = {}, None
    for p in paras:
        m = re.match(r"Slide (\d+)$", text(p)) if d.style(p) == "Heading1" else None
        if m:
            cur = int(m.group(1))
            narration[cur] = []
        elif cur is not None and text(p):
            narration[cur].append(text(p))
    plan = {s["n"]: s for s in json.loads((kit / "lesson_plan.json").read_text())}
    slug = "stage-1-requirements"
    dest = SEED / "lesson-assets" / slug
    shutil.rmtree(SEED / "lesson-assets", ignore_errors=True)
    dest.mkdir(parents=True)
    slides, chapter = [], None
    for n in sorted(narration):
        chapter = plan.get(n, {}).get("chapter") or chapter
        img = kit / "slides" / f"slide-{n:02d}.png"
        shutil.copy(img, dest / img.name)
        slides.append({"n": n, "chapter": chapter or "Introduction", "narration": "\n\n".join(narration[n]), "image": img.name})
    cover = kit / "slides" / f"slide-{max(narration) + 1:02d}.png"  # the deck's last image is the thumbnail
    if cover.exists():
        shutil.copy(cover, dest / "cover.png")
    lessons = [{"slug": slug, "ord": 0, "stage": 1, "title": "Gather the requirements",
                "subtitle": "The Stage 1 lesson: the six parts of a requirements document, the questions that fill each part, "
                            "and how to check the document is ready.",
                "cover": "cover.png" if cover.exists() else None, "slides": slides}]
    (SEED / "lessons.json").write_text(json.dumps(lessons, indent=1, ensure_ascii=False))
    print(f"  lesson {slug}: {len(slides)} slides, {len({s['chapter'] for s in slides})} chapters")


if __name__ == "__main__":
    print("workbooks:", workbooks())
    lesson()
