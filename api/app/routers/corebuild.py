"""The Core Build track: the stage workbooks and the narrated lessons.

A workbook is a complete page with its own styles and scripts. It is served as it was written, inside a frame on the
site, with one small script added at the top that (1) puts back what the learner saved in it on any device, (2) sends
what the page saves in localStorage to the API, so progress follows the account, and (3) follows the site's theme."""
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Learner, LearnerState, Lesson, LessonSlide, Workbook, WorkbookFile
from ..security import current_learner

router = APIRouter(prefix="/api/core-build", tags=["core build"])

SHIM = """<script>/* added by the learning platform: saved progress, theme, links */
(function(){
  var SLUG=%(slug)s, SAVED=%(saved)s, keys={}, timer=null, P=Storage.prototype, set=P.setItem, rem=P.removeItem;
  try{for(var k in SAVED){set.call(localStorage,k,SAVED[k]);keys[k]=1}}catch(e){}
  function flush(keep){
    var ls={};for(var k in keys){try{var v=localStorage.getItem(k);if(v!==null)ls[k]=v}catch(e){}}
    try{fetch('/api/state/workbook/'+SLUG,{method:'PUT',credentials:'same-origin',keepalive:!!keep,
      headers:{'content-type':'application/json'},body:JSON.stringify({value:{ls:ls,visited:new Date().toISOString()}})}).then(function(r){
      try{parent.postMessage({type:'workbook-saved',slug:SLUG,ok:r.ok},location.origin)}catch(e){}})}catch(e){}
  }
  function soon(){clearTimeout(timer);timer=setTimeout(flush,700)}
  P.setItem=function(k,v){set.call(this,k,v);if(this===localStorage){keys[String(k)]=1;soon()}};
  P.removeItem=function(k){rem.call(this,k);if(this===localStorage&&keys[k]){soon()}};
  addEventListener('pagehide',function(){if(timer){clearTimeout(timer);flush(true)}});
  var t=new URLSearchParams(location.search).get('theme');
  if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
  addEventListener('message',function(e){
    if(e.origin===location.origin&&e.data&&e.data.type==='theme')document.documentElement.setAttribute('data-theme',e.data.theme);
  });
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href]');
    if(a&&a.origin!==location.origin){a.target='_blank';a.rel='noopener noreferrer'}
  },true);
  soon();
})();</script>"""


HEAD = re.compile(r"<head(\s[^>]*)?>", re.I)


def _with_shim(page: str, shim: str) -> str:
    """Full pages get the script first thing in <head>. Some workbooks are fragments (no doctype, html or head, written to
    be wrapped by a page skeleton); those are wrapped in a standards-mode document here."""
    m = HEAD.search(page[:4000])
    if m and page.lstrip()[:9].lower() == "<!doctype":
        return page[: m.end()] + shim + page[m.end():]
    return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            f"{shim}</head><body>\n{page}\n</body></html>")


def _state(db: Session, learner: Learner, ns: str, key: str) -> dict:
    row = db.get(LearnerState, (learner.id, ns, key))
    return row.value if row and isinstance(row.value, dict) else {}


@router.get("/workbooks")
def workbooks(response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    st = {s.key: s.value for s in db.scalars(select(LearnerState).where(
        LearnerState.learner_id == learner.id, LearnerState.namespace == "workbook"))}
    files: dict[str, list] = {}
    for f in db.scalars(select(WorkbookFile)):
        files.setdefault(f.workbook_slug, []).append({"name": f.name, "label": f.label,
                                                      "href": f"/api/core-build/workbooks/{f.workbook_slug}/files/{f.name}"})
    return [{"slug": w.slug, "stage": w.stage, "title": w.title, "summary": w.summary, "companion": w.companion,
             "visited": (st.get(w.slug) or {}).get("visited"), "saved": len((st.get(w.slug) or {}).get("ls") or {}),
             "files": files.get(w.slug, [])}
            for w in db.scalars(select(Workbook).order_by(Workbook.ord))]


@router.get("/workbooks/{slug}/page", response_class=HTMLResponse)
def workbook_page(slug: str, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    w = db.get(Workbook, slug)
    if w is None:
        raise HTTPException(404, "no such workbook")
    saved = _state(db, learner, "workbook", slug).get("ls") or {}
    js = lambda v: json.dumps(v).replace("</", "<\\/").replace("<!--", "<\\!--")  # noqa: E731 - safe inside <script>
    shim = SHIM % {"slug": js(slug), "saved": js({k: v for k, v in saved.items() if isinstance(v, str)})}
    page = _with_shim(w.html, shim)
    return HTMLResponse(page, headers={"Cache-Control": "private, no-store", "X-Frame-Options": "SAMEORIGIN",
                                       "Content-Security-Policy": "frame-ancestors 'self'"})


@router.get("/workbooks/{slug}/files/{name}")
def workbook_file(slug: str, name: str, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    f = db.get(WorkbookFile, (slug, name))
    if f is None:
        raise HTTPException(404, "no such file")
    return Response(f.data, media_type=f.content_type,
                    headers={"Content-Disposition": f'attachment; filename="{f.name}"', "Cache-Control": "private, max-age=3600"})


@router.get("/lessons")
def lessons(response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    counts = dict(db.execute(select(LessonSlide.lesson_slug, func.count()).group_by(LessonSlide.lesson_slug)).all())
    out = []
    for l in db.scalars(select(Lesson).order_by(Lesson.ord)):
        st = _state(db, learner, "lesson", l.slug)
        out.append({"slug": l.slug, "stage": l.stage, "title": l.title, "subtitle": l.subtitle, "slides": counts.get(l.slug, 0),
                    "cover": f"/api/core-build/lessons/{l.slug}/cover.png" if l.cover else None,
                    "at": st.get("slide", 0), "done": bool(st.get("done"))})
    return out


@router.get("/lessons/{slug}")
def lesson(slug: str, response: Response, learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    l = db.get(Lesson, slug)
    if l is None:
        raise HTTPException(404, "no such lesson")
    rows = db.execute(select(LessonSlide.n, LessonSlide.chapter, LessonSlide.narration)
                      .where(LessonSlide.lesson_slug == slug).order_by(LessonSlide.n)).all()
    st = _state(db, learner, "lesson", slug)
    return {"slug": l.slug, "stage": l.stage, "title": l.title, "subtitle": l.subtitle,
            "slides": [{"n": n, "chapter": c, "narration": t, "image": f"/api/core-build/lessons/{slug}/slides/{n}.png"}
                       for n, c, t in rows],
            "at": st.get("slide", 0), "done": bool(st.get("done"))}


@router.get("/lessons/{slug}/slides/{n}.png")
def slide(slug: str, n: int, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    s = db.get(LessonSlide, (slug, n))
    if s is None:
        raise HTTPException(404, "no such slide")
    return Response(s.image, media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/lessons/{slug}/cover.png")
def cover(slug: str, _: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    l = db.get(Lesson, slug)
    if l is None or l.cover is None:
        raise HTTPException(404, "no cover")
    return Response(l.cover, media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})
