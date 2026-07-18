"""
FastAPI app entry point.

To run:
    uvicorn app.main:app --reload

Then interactive API docs (Swagger UI) will be available at
http://localhost:8000/docs, where you can test the /jd/upload endpoint
directly, without building a frontend.
"""

import os

# Load environment variables from a .env file, if one exists, BEFORE any
# other app module is imported. This must happen first -- modules like
# app.db.session and app.services.gemini_service read DATABASE_URL /
# GEMINI_API_KEY / SECRET_KEY with os.getenv() at import time, so if this
# loads after those imports, it would be too late to have any effect.
#
# This is what lets each teammate set up their own DATABASE_URL/API key
# ONCE in a .env file, instead of needing to run 'set VAR=value' in every
# new terminal session (easy to forget, and the #1 cause of "works on my
# machine, not on my teammate's machine" for this project).
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.base import Base
from app.db.session import engine
# Models need to be imported here so that Base.metadata "sees" them when
# create_all() is called -- otherwise their tables won't be created.
from app.models import hr_user, job_profile, candidate, criterion_evaluation, screening_run, document_verification  # noqa: F401
from app.routers import auth, jd_upload, job_profiles, candidates, screening, results, review, dashboard, verification

app = FastAPI(title="IHMCL HR Screening System")

# The frontend runs on a different origin (e.g. http://localhost:5173 for
# Vite's dev server) than the backend (http://localhost:8000), so the
# browser needs explicit CORS permission -- and because auth uses a
# cookie (not a bearer token), allow_credentials must be True and the
# origin list can't use a wildcard "*" (browsers reject credentialed
# requests with a wildcard origin).
FRONTEND_ORIGINS = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple create_all() for now -- creates tables if they don't already
# exist. In production, this should be replaced with Alembic migrations
# instead (to properly track/version schema changes).
Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(jd_upload.router)
app.include_router(job_profiles.router)
app.include_router(candidates.router)
app.include_router(screening.single_router)
app.include_router(screening.batch_router)
app.include_router(results.router)
app.include_router(review.router)
app.include_router(dashboard.router)
app.include_router(verification.router)


@app.get("/")
def root():
    return {"status": "IHMCL HR Screening System API is running"}
