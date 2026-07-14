"""
Auth service -- password hashing, signed session cookie, and a FastAPI
dependency (`get_current_hr_user`) used to protect the other routers.

Cookie approach: we don't maintain a server-side session table -- the
cookie itself is cryptographically signed (via itsdangerous), so it's
tamper-proof and verifiable without a DB lookup (the only DB check is
whether the user still exists).

SECRET_KEY must be set as an environment variable in production -- if it
leaks, an attacker could forge valid cookies.
"""

import os
from datetime import datetime

import bcrypt
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from fastapi import Request, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.hr_user import HRUser

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-this-in-production")
COOKIE_NAME = "hr_session"
# 30 days -- satisfies the "long-lived cookie, no repeated login prompts" requirement
COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

_serializer = URLSafeTimedSerializer(SECRET_KEY, salt="hr-session-salt")


# ---- Password hashing ----

def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


# ---- Signed session token ----

def create_session_token(user_id: str, email: str) -> str:
    return _serializer.dumps({"user_id": user_id, "email": email})


def read_session_token(token: str) -> dict | None:
    """Returns None if the token is invalid, tampered with, or expired."""
    try:
        return _serializer.loads(token, max_age=COOKIE_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None


# ---- FastAPI dependency: for protected routes ----

def get_current_hr_user(request: Request, db: Session = Depends(get_db)) -> HRUser:
    """Attach this dependency to any route that should require login.
    Raises 401 if the cookie is missing, invalid, or expired."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Login required")

    data = read_session_token(token)
    if not data:
        raise HTTPException(
            status_code=401,
            detail="Session has expired or is invalid -- please log in again",
        )

    user = db.query(HRUser).filter(HRUser.id == data["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User account not found")

    return user
