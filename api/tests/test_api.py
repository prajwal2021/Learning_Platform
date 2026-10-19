"""Run against a seeded database:  DATABASE_URL=... python -m app.cli seed && pytest"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.cli import new_code
from app.db import engine
from app.main import app
from app.models import AccessCode
from app.security import hash_code


@pytest.fixture(scope="module")
def code():
    c = new_code()
    with Session(engine) as db:
        row = AccessCode(code_hash=hash_code(c), label="pytest")
        db.add(row)
        db.commit()
        rid = row.id
    yield c
    with Session(engine) as db:
        db.delete(db.get(AccessCode, rid))
        db.commit()


@pytest.fixture()
def anon():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def me(code):
    with TestClient(app) as c:
        r = c.post("/api/auth/redeem", json={"code": code, "name": "pytest " + uuid.uuid4().hex[:6]})
        assert r.status_code == 200
        yield c


def test_content_needs_a_session(anon):
    for url in ("/api/path", "/api/stackmap/bootstrap", "/api/stackmap/labs/base", "/api/challenges", "/api/state/path"):
        assert anon.get(url).status_code == 401, url


def test_wrong_code_is_rejected(anon):
    assert anon.post("/api/auth/redeem", json={"code": "AAAA-BBBB-CCCC-DDDD", "name": "x"}).status_code == 401


def test_cookie_is_httponly(code):
    with TestClient(app) as c:
        r = c.post("/api/auth/redeem", json={"code": code, "name": "cookie check"})
        assert "httponly" in r.headers["set-cookie"].lower()


def test_revoked_code_ends_access(code, me):
    from datetime import datetime, timezone
    with Session(engine) as db:
        row = db.query(AccessCode).filter_by(code_hash=hash_code(code)).one()
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()
    try:
        assert me.get("/api/path").status_code == 401
    finally:
        with Session(engine) as db:
            row = db.query(AccessCode).filter_by(code_hash=hash_code(code)).one()
            row.revoked_at = None
            db.commit()


def test_lab_loads_one_lab_at_a_time(me):
    d = me.get("/api/stackmap/labs/base").json()
    assert set(d) == {"body", "files", "setup", "folder", "filesui", "explain"} and d["body"]
    assert me.get("/api/stackmap/labs/nope").status_code == 404


def test_challenge_hides_the_answer_key(me):
    slug = me.get("/api/challenges").json()[0]["slug"]
    d = me.get(f"/api/challenges/{slug}").json()
    assert len(d["steps"]) == 1  # later steps are not sent
    assert all(set(o) == {"id", "text"} for o in d["steps"][0]["options"])
    assert "explanation" not in d["steps"][0] and d["takeaway"] is None


def test_challenge_flow(me):
    slug = me.get("/api/challenges").json()[0]["slug"]
    first = me.get(f"/api/challenges/{slug}").json()["steps"][0]
    me.post(f"/api/challenges/{slug}/reset")
    # an out-of-order answer is refused
    assert me.post(f"/api/challenges/{slug}/answer", json={"step": 2, "option": "a"}).status_code == 409
    wrong = right = None
    for o in first["options"]:
        r = me.post(f"/api/challenges/{slug}/answer", json={"step": 0, "option": o["id"]}).json()
        if r["correct"]:
            right = r
            break
        assert r["hint"]  # a wrong pick comes with a hint
        wrong = r
    assert right and right["explanation"]
    # the answered step now carries its reasoning, and the next one is available
    d = me.get(f"/api/challenges/{slug}").json()
    assert d["current"] == 1 and len(d["steps"]) == 2 and d["steps"][0]["explanation"]
    me.post(f"/api/challenges/{slug}/reset")


def test_drafts_are_not_served(me):
    slugs = {c["slug"] for c in me.get("/api/challenges").json()}
    for slug in ("charged-twice", "leaderboard-gets-slower"):  # held back by the reviewer
        if slug not in slugs:
            assert me.get(f"/api/challenges/{slug}").status_code == 404


def test_state_rules(me):
    assert me.put("/api/state/nope/x", json={"value": 1}).status_code == 404
    assert me.put("/api/state/stackmap/bad key!", json={"value": 1}).status_code == 422
    me.put("/api/state/path/done", json={"value": {"u1.read": True, "made.up": True, "u1.see": False}})
    assert me.get("/api/state/path").json()["done"] == {"u1.read": True}  # unknown ids and false values are dropped
    me.put("/api/state/path/done", json={"value": {}})


def test_interview_questions(me):
    topics = me.get("/api/interview/topics").json()
    assert topics and set(topics[0]) == {"slug", "name", "category", "counts", "known"}
    slug = topics[0]["slug"]
    d = me.get(f"/api/interview/topics/{slug}").json()
    q = d["questions"][0]
    assert {"id", "level", "question", "answer", "real_world", "code_lang", "code", "follow_up"} <= set(q)
    assert me.put(f"/api/interview/topics/{slug}/marks", json={"question_id": q["id"], "mark": "known"}).status_code == 200
    assert me.get(f"/api/interview/topics/{slug}").json()["marks"][q["id"]] == "known"
    assert me.put(f"/api/interview/topics/{slug}/marks", json={"question_id": q["id"], "mark": "bogus"}).status_code == 422
    assert me.put(f"/api/interview/topics/{slug}/marks", json={"question_id": "nope-nope", "mark": "known"}).status_code == 404
    me.put(f"/api/interview/topics/{slug}/marks", json={"question_id": q["id"], "mark": None})
    assert me.post(f"/api/interview/questions/{q['id']}/flag", json={"note": "test"}).status_code == 200


def test_interview_needs_a_session(anon):
    assert anon.get("/api/interview/topics").status_code == 401


# ------------------------------------------------------------------ accounts, overview, Core Build, roadmap
@pytest.fixture()
def account():
    email = f"pytest-{uuid.uuid4().hex[:8]}@example.com"
    with TestClient(app) as c:
        r = c.post("/api/auth/signup", json={"name": "Py Test", "email": email, "password": "correct horse 1"})
        assert r.status_code == 200 and r.json()["methods"] == ["password"]
        yield c, email


def test_signup_login_and_duplicates(account):
    c, email = account
    assert c.get("/api/auth/me").json()["email"] == email
    assert c.post("/api/auth/signup", json={"name": "x", "email": email.upper(), "password": "another pass"}).status_code == 409
    with TestClient(app) as other:
        assert other.post("/api/auth/login", json={"email": email, "password": "wrong password"}).status_code == 401
        assert other.post("/api/auth/login", json={"email": email.upper(), "password": "correct horse 1"}).status_code == 200


def test_password_is_hashed(account):
    from app.models import Learner
    c, email = account
    with Session(engine) as db:
        row = db.query(Learner).filter_by(email=email).one()
        assert row.password_hash.startswith("scrypt$") and "correct horse" not in row.password_hash


def test_short_password_and_bad_email(anon):
    assert anon.post("/api/auth/signup", json={"name": "x", "email": "a@b.co", "password": "short"}).status_code == 422
    assert anon.post("/api/auth/signup", json={"name": "x", "email": "not-an-email", "password": "long enough"}).status_code == 422


def test_providers_and_unconfigured_start(anon):
    ps = {p["id"]: p for p in anon.get("/api/auth/providers").json()}
    assert set(ps) == {"google", "microsoft", "apple"}
    if not ps["google"]["configured"]:
        r = anon.get("/api/auth/oauth/google/start", follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"].startswith("/login?error=")


def test_oauth_callback_needs_the_state_cookie(anon):
    r = anon.get("/api/auth/oauth/google/callback?code=x&state=y", follow_redirects=False)
    assert r.status_code == 303 and "/login?error=" in r.headers["location"]


def test_overview_counts_activity(account):
    c, _ = account
    c.put("/api/state/path/done", json={"value": {"u0.read": True}})
    d = c.get("/api/me/overview").json()
    assert d["path"]["done"] == 1 and d["path"]["next"]["step"] != "u0.read"
    assert d["activity"]["streak"] == 1 and d["interview"]["questions"] > 0 and d["challenges"]["today"]
    assert d["workbooks"]["total"] == 11


def test_access_code_learner_cannot_rename_before_adding_email(me):
    assert me.patch("/api/me", json={"name": "New"}).status_code == 409


def test_workbook_page_restores_progress(account):
    c, _ = account
    slug = c.get("/api/core-build/workbooks").json()[0]["slug"]
    assert c.put(f"/api/state/workbook/{slug}", json={"value": {"ls": {"k1": "</script><b>"}, "visited": "x"}}).status_code == 200
    r = c.get(f"/api/core-build/workbooks/{slug}/page")
    assert r.status_code == 200 and r.headers["x-frame-options"] == "SAMEORIGIN"
    assert "<\\/script><b>" in r.text and "</script><b>" not in r.text  # saved text cannot end the added script
    assert c.get("/api/core-build/workbooks").json()[0]["visited"] == "x"


def test_lesson_and_slides(account):
    c, _ = account
    l = c.get("/api/core-build/lessons").json()[0]
    d = c.get(f"/api/core-build/lessons/{l['slug']}").json()
    assert len(d["slides"]) == l["slides"] > 50 and d["slides"][0]["narration"]
    assert c.get(d["slides"][0]["image"]).headers["content-type"] == "image/png"


def test_roadmap_graph_is_connected(account):
    c, _ = account
    g = c.get("/api/roadmap").json()
    ids = {n["id"] for n in g["nodes"]}
    assert {"stage-1", "unit-0", "lab-base", "comp-app"} <= ids
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])


def test_search(account):
    c, _ = account
    kinds = {r["type"] for r in c.get("/api/search?q=redis").json()}
    assert "topic" in kinds and "question" in kinds


def test_new_routes_need_a_session(anon):
    for url in ("/api/me/overview", "/api/roadmap", "/api/search?q=redis", "/api/core-build/workbooks",
                "/api/core-build/lessons", "/api/core-build/workbooks/stage-1-requirements/page"):
        assert anon.get(url).status_code == 401, url


def test_workbook_fragments_are_wrapped_in_a_document(account):
    c, _ = account
    for w in c.get("/api/core-build/workbooks").json():
        page = c.get(f"/api/core-build/workbooks/{w['slug']}/page").text
        assert page.lstrip()[:9].lower() == "<!doctype", w["slug"]           # standards mode, never quirks
        assert page.index("added by the learning platform") < page.lower().index("</head>"), w["slug"]
