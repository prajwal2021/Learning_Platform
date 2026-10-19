"""Sign-in with Google, Microsoft and Apple: the OAuth 2.0 authorization code flow, done on the server.

The browser is sent to the provider with a random `state` (and a PKCE challenge where the provider takes one). Both are
kept in a short-lived signed cookie, so the callback can check that it answers a sign-in this browser started. The
callback swaps the code for tokens over a direct HTTPS call and reads who the person is; no token reaches the browser.
"""
import base64
import hashlib
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt

from .config import settings

STATE_COOKIE = "lp_oauth"


@dataclass(frozen=True)
class Provider:
    name: str
    label: str
    authorize_url: str
    token_url: str
    scope: str
    pkce: bool = True
    form_post: bool = False  # Apple posts the answer back as a form instead of a redirect with a query string


def providers() -> dict[str, Provider]:
    tenant = settings.microsoft_tenant or "common"
    return {
        "google": Provider("google", "Google", "https://accounts.google.com/o/oauth2/v2/auth",
                           "https://oauth2.googleapis.com/token", "openid email profile"),
        "microsoft": Provider("microsoft", "Microsoft", f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
                              f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", "openid email profile"),
        "apple": Provider("apple", "Apple", "https://appleid.apple.com/auth/authorize", "https://appleid.apple.com/auth/token",
                          "name email", pkce=False, form_post=True),
    }


def configured(name: str) -> bool:
    if name == "google":
        return bool(settings.google_client_id and settings.google_client_secret)
    if name == "microsoft":
        return bool(settings.microsoft_client_id and settings.microsoft_client_secret)
    if name == "apple":
        return bool(settings.apple_client_id and settings.apple_team_id and settings.apple_key_id and settings.apple_private_key)
    return False


def redirect_uri(name: str) -> str:
    return f"{settings.public_url.rstrip('/')}/api/auth/oauth/{name}/callback"


def _client_id(name: str) -> str:
    return {"google": settings.google_client_id, "microsoft": settings.microsoft_client_id, "apple": settings.apple_client_id}[name]


def _client_secret(name: str) -> str:
    if name == "google":
        return settings.google_client_secret
    if name == "microsoft":
        return settings.microsoft_client_secret
    # Apple's client secret is a short-lived JWT signed with the team's private key (ES256)
    now = int(time.time())
    key = settings.apple_private_key.replace("\\n", "\n")
    return jwt.encode({"iss": settings.apple_team_id, "iat": now, "exp": now + 300, "aud": "https://appleid.apple.com",
                       "sub": settings.apple_client_id}, key, algorithm="ES256", headers={"kid": settings.apple_key_id})


def start(name: str, next_path: str) -> tuple[str, str]:
    """Returns the provider URL to send the browser to, and the signed value of the state cookie."""
    p = providers()[name]
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(16)
    params = {"client_id": _client_id(name), "redirect_uri": redirect_uri(name), "response_type": "code",
              "scope": p.scope, "state": state, "nonce": nonce}
    verifier = ""
    if p.pkce:
        verifier = secrets.token_urlsafe(48)
        params["code_challenge"] = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        params["code_challenge_method"] = "S256"
    if p.form_post:
        params["response_mode"] = "form_post"
    if name == "google":
        params["prompt"] = "select_account"
    if name == "microsoft":
        params["prompt"] = "select_account"
    cookie = jwt.encode({"p": name, "s": state, "v": verifier, "n": nonce, "next": next_path, "exp": int(time.time()) + 600},
                        settings.secret_key, algorithm="HS256")
    return f"{p.authorize_url}?{urlencode(params)}", cookie


def read_state(cookie: str | None, name: str, state: str | None) -> dict:
    if not cookie or not state:
        raise ValueError("the sign-in was not started from this browser, or took longer than ten minutes")
    try:
        data = jwt.decode(cookie, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ValueError("the sign-in took longer than ten minutes")
    if data.get("p") != name or not secrets.compare_digest(data.get("s", ""), state):
        raise ValueError("the sign-in answer does not match the one this browser started")
    return data


@dataclass
class Person:
    subject: str
    email: str
    email_verified: bool
    name: str
    avatar_url: str | None


def finish(name: str, code: str, st: dict, apple_user: dict | None = None) -> Person:
    """Swaps the code for tokens and reads who signed in."""
    form = {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri(name),
            "client_id": _client_id(name), "client_secret": _client_secret(name)}
    if st.get("v"):
        form["code_verifier"] = st["v"]
    with httpx.Client(timeout=10) as http:
        r = http.post(providers()[name].token_url, data=form, headers={"accept": "application/json"})
        if r.status_code != 200:
            raise ValueError(f"{providers()[name].label} did not accept the sign-in ({r.status_code})")
        tokens = r.json()
        if name == "google":
            u = http.get("https://openidconnect.googleapis.com/v1/userinfo",
                         headers={"authorization": f"Bearer {tokens['access_token']}"}).raise_for_status().json()
            return Person(u["sub"], u.get("email", ""), bool(u.get("email_verified")), u.get("name") or u.get("given_name") or "",
                          u.get("picture"))
        if name == "microsoft":
            u = http.get("https://graph.microsoft.com/oidc/userinfo",
                         headers={"authorization": f"Bearer {tokens['access_token']}"}).raise_for_status().json()
            # Microsoft does not promise that the email belongs to the person, so it is never used to join accounts
            return Person(u["sub"], u.get("email", ""), False, u.get("name") or u.get("given_name") or "", None)
    # Apple: who signed in is in the ID token, checked against Apple's published keys
    claims = _apple_claims(tokens["id_token"], st.get("n", ""))
    full = ""
    if apple_user:  # Apple sends the name once, on the first sign-in only
        n = apple_user.get("name") or {}
        full = " ".join(x for x in (n.get("firstName"), n.get("lastName")) if x)
    verified = claims.get("email_verified") in (True, "true")
    return Person(claims["sub"], claims.get("email", ""), verified, full, None)


_apple_keys = jwt.PyJWKClient("https://appleid.apple.com/auth/keys", cache_keys=True)


def _apple_claims(id_token: str, nonce: str) -> dict:
    key = _apple_keys.get_signing_key_from_jwt(id_token).key
    claims = jwt.decode(id_token, key, algorithms=["RS256"], audience=settings.apple_client_id, issuer="https://appleid.apple.com")
    if nonce and claims.get("nonce") and not secrets.compare_digest(claims["nonce"], nonce):
        raise ValueError("the Apple sign-in does not match the one this browser started")
    return claims
