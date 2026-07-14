"""
Auth endpoints -- login, logout, and current-user check.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.hr_user import HRUser
from app.services.auth_service import (
    verify_password,
    create_session_token,
    get_current_hr_user,
    COOKIE_NAME,
    COOKIE_MAX_AGE_SECONDS,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(HRUser).filter(HRUser.email == email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        # Deliberately a generic error ("invalid email or password") --
        # not revealing whether the email exists makes account
        # enumeration attacks harder.
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_session_token(user.id, user.email)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE_SECONDS,
        httponly=True,   # cookie can't be accessed from JS -- XSS protection
        samesite="lax",
        # secure=True,  # uncomment this line in production, when serving over HTTPS
    )

    user.last_login_at = datetime.utcnow()
    db.commit()

    return UserOut(id=user.id, email=user.email)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"status": "logged out"}


@router.get("/me", response_model=UserOut)
def get_me(current_user: HRUser = Depends(get_current_hr_user)):
    """The frontend can call this to check whether the cookie is still
    valid (e.g. on app load)."""
    return UserOut(id=current_user.id, email=current_user.email)
