"""Signing in: an account (email and password, or Google, Microsoft or Apple), or an access code with a name."""
import json
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, Form, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import oauth
from ..config import settings
from ..db import get_db
from ..models import AccessCode, Learner, OAuthIdentity
from ..security import (COOKIE, EMAIL, check_password, current_learner, hash_code, hash_password, limit_signin,
                        name_key, normalize_email, set_session)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def profile(db: Session, learner: Learner) -> dict:
    methods = sorted(i.provider for i in db.scalars(select(OAuthIdentity).where(OAuthIdentity.learner_id == learner.id)))
    if learner.password_hash:
        methods.insert(0, "password")
    if learner.access_code_id is not None:
        methods.append("code")
    return {"id": str(learner.id), "name": learner.name, "email": learner.email, "avatar_url": learner.avatar_url,
            "methods": methods, "joined": learner.created_at.isoformat()}


def safe_next(path: str | None) -> str:
    return path if path and path.startswith("/") and not path.startswith("//") else "/"


# ------------------------------------------------------------------ access code (the original way in)
class Redeem(BaseModel):
    code: str = Field(min_length=4, max_length=64)
    name: str = Field(min_length=1, max_length=60)


@router.post("/redeem")
def redeem(body: Redeem, request: Request, response: Response, db: Session = Depends(get_db)):
    limit_signin(request)
    code = db.scalar(select(AccessCode).where(AccessCode.code_hash == hash_code(body.code)))
    if code is None or code.revoked_at is not None:
        raise HTTPException(401, "That access code is not valid.")
    key = name_key(body.name)
    if not key:
        raise HTTPException(422, "Enter a name.")
    learner = db.scalar(select(Learner).where(Learner.access_code_id == code.id, Learner.name_key == key))
    if learner is None:
        learner = Learner(access_code_id=code.id, name=body.name.strip(), name_key=key)
        db.add(learner)
    learner.last_seen = datetime.now(timezone.utc)
    db.commit()
    set_session(response, learner.id)
    return {"name": learner.name}


# ------------------------------------------------------------------ email and password
class SignUp(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)


class SignIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


@router.post("/signup")
def signup(body: SignUp, request: Request, response: Response, db: Session = Depends(get_db)):
    limit_signin(request)
    email, name = normalize_email(body.email), body.name.strip()
    if not EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if not name:
        raise HTTPException(422, "Enter your name.")
    if db.scalar(select(Learner).where(Learner.email == email)):
        raise HTTPException(409, "An account with that email already exists. Sign in instead.")
    learner = Learner(name=name, name_key=name_key(name), email=email, password_hash=hash_password(body.password))
    db.add(learner)
    db.commit()
    set_session(response, learner.id)
    return profile(db, learner)


@router.post("/login")
def login(body: SignIn, request: Request, response: Response, db: Session = Depends(get_db)):
    limit_signin(request)
    learner = db.scalar(select(Learner).where(Learner.email == normalize_email(body.email)))
    if not check_password(body.password, learner.password_hash if learner else None):
        raise HTTPException(401, "Email or password is incorrect.")
    learner.last_seen = datetime.now(timezone.utc)
    db.commit()
    set_session(response, learner.id)
    return profile(db, learner)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(learner: Learner = Depends(current_learner), db: Session = Depends(get_db)):
    return profile(db, learner)


# ------------------------------------------------------------------ Google, Microsoft, Apple
@router.get("/providers")
def list_providers():
    return [{"id": p.name, "label": p.label, "configured": oauth.configured(p.name)} for p in oauth.providers().values()]


@router.get("/oauth/{name}/start")
def oauth_start(name: str, request: Request, next: str = "/"):
    if name not in oauth.providers():
        raise HTTPException(404, "no such provider")
    if not oauth.configured(name):
        return RedirectResponse(f"/login?error={quote(oauth.providers()[name].label + ' sign-in is not set up on this server yet.')}", 303)
    limit_signin(request, max_hits=30)
    url, cookie = oauth.start(name, safe_next(next))
    resp = RedirectResponse(url, 303)
    # Apple answers with a cross-site form POST, which only carries a SameSite=None cookie (and that needs HTTPS)
    apple = oauth.providers()[name].form_post
    resp.set_cookie(oauth.STATE_COOKIE, cookie, max_age=600, httponly=True, path="/api/auth/oauth",
                    samesite="none" if apple else "lax", secure=True if apple else settings.cookie_secure)
    return resp


def _fail(message: str) -> RedirectResponse:
    resp = RedirectResponse(f"/login?error={quote(message)}", 303)
    resp.delete_cookie(oauth.STATE_COOKIE, path="/api/auth/oauth")
    return resp


def _complete(name: str, code: str | None, state: str | None, error: str | None, cookie: str | None,
              db: Session, apple_user: dict | None = None) -> RedirectResponse:
    label = oauth.providers()[name].label
    if error:
        return _fail("Sign-in was cancelled." if error in ("access_denied", "user_cancelled_authorize") else f"{label} sign-in failed.")
    try:
        st = oauth.read_state(cookie, name, state)
        if not code:
            raise ValueError("no code")
        person = oauth.finish(name, code, st, apple_user)
    except Exception as e:  # noqa: BLE001 - every failure ends on the sign-in page with a message
        return _fail(f"{label} sign-in failed: {e}" if isinstance(e, ValueError) else f"{label} sign-in failed. Try again.")

    ident = db.get(OAuthIdentity, (name, person.subject))
    learner = db.get(Learner, ident.learner_id) if ident else None
    email = normalize_email(person.email) if person.email else None
    if learner is None and email and person.email_verified:
        # the provider vouches for the address, so it is the same person as the account that has it
        learner = db.scalar(select(Learner).where(Learner.email == email))
    if learner is None:
        display = (person.name or (email.split("@")[0] if email else f"{label} user"))[:60]
        taken = email and db.scalar(select(Learner.id).where(Learner.email == email))
        learner = Learner(name=display, name_key=name_key(display), email=None if taken else email, avatar_url=person.avatar_url)
        db.add(learner)
        db.flush()
    if ident is None:
        db.add(OAuthIdentity(provider=name, subject=person.subject, learner_id=learner.id, email=email or ""))
    if person.avatar_url and not learner.avatar_url:
        learner.avatar_url = person.avatar_url
    learner.last_seen = datetime.now(timezone.utc)
    db.commit()
    resp = RedirectResponse(safe_next(st.get("next")), 303)
    resp.delete_cookie(oauth.STATE_COOKIE, path="/api/auth/oauth")
    set_session(resp, learner.id)
    return resp


@router.get("/oauth/{name}/callback")
def oauth_callback(name: str, code: str | None = None, state: str | None = None, error: str | None = None,
                   lp_oauth: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if name not in oauth.providers():
        raise HTTPException(404, "no such provider")
    return _complete(name, code, state, error, lp_oauth, db)


@router.post("/oauth/{name}/callback")
def oauth_callback_post(name: str, code: str | None = Form(default=None), state: str | None = Form(default=None),
                        error: str | None = Form(default=None), user: str | None = Form(default=None),
                        lp_oauth: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if name not in oauth.providers():
        raise HTTPException(404, "no such provider")
    try:
        apple_user = json.loads(user) if user else None
    except ValueError:
        apple_user = None
    return _complete(name, code, state, error, lp_oauth, db, apple_user)
