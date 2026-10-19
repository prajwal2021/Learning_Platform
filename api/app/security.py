import base64
import hashlib
import hmac
import re
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AccessCode, Learner

COOKIE = "lp_session"


def normalize_code(raw: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", raw.upper())


def hash_code(raw: str) -> str:
    # Codes are long and random, so a keyed hash is enough; the key keeps a leaked table from being guessed offline.
    return hmac.new(settings.secret_key.encode(), normalize_code(raw).encode(), hashlib.sha256).hexdigest()


def name_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).casefold()


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,189}\.[^@\s]{2,}$")


# Passwords: scrypt from the standard library, with a random salt per password.
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def check_password(password: str, stored: str | None) -> bool:
    if not stored:
        # same work as a real check, so a missing account takes as long to refuse as a wrong password
        hashlib.scrypt(password.encode(), salt=b"0" * 16, n=_N, r=_R, p=_P, dklen=32)
        return False
    try:
        _, n, r, p, salt, dk = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got, base64.b64decode(dk))
    except ValueError:
        return False


def set_session(response: Response, learner_id: uuid.UUID) -> None:
    response.set_cookie(
        COOKIE, make_token(learner_id), max_age=settings.session_days * 86400,
        httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )


def make_token(learner_id: uuid.UUID) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=settings.session_days)
    return jwt.encode({"sub": str(learner_id), "exp": exp}, settings.secret_key, algorithm="HS256")


def current_learner(
    token: str | None = Cookie(default=None, alias=COOKIE), db: Session = Depends(get_db)
) -> Learner:
    if not token:
        raise HTTPException(401, "not signed in")
    try:
        sub = jwt.decode(token, settings.secret_key, algorithms=["HS256"])["sub"]
        learner = db.get(Learner, uuid.UUID(sub))
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, "not signed in")
    if learner is None:
        raise HTTPException(401, "not signed in")
    if learner.access_code_id is not None:  # revoking a code signs everyone who used it out
        code = db.get(AccessCode, learner.access_code_id)
        if code is None or code.revoked_at is not None:
            raise HTTPException(401, "access ended")
    return learner


# A small in-memory limiter for the sign-in endpoint (per process; use a shared store if you run several API containers).
_hits: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    if settings.trust_proxy:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def limit_signin(request: Request, max_hits: int = 10, window: int = 600) -> None:
    q, now = _hits[client_ip(request)], time.monotonic()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= max_hits:
        raise HTTPException(429, "too many attempts, wait a few minutes")
    q.append(now)
