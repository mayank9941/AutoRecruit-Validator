"""
Screening endpoints -- single-candidate evaluation, plus batch screening
with live progress tracking.

Candidates whose documents are missing/incomplete are skipped (not sent to
Gemini at all) -- this matches the requirement that missing documents
shouldn't waste an LLM call and should be tracked separately from genuine
evaluation failures. If one candidate's processing fails unexpectedly for
any other reason, the whole batch does not stop -- only that candidate is
marked "not_evaluated".
"""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.models.job_profile import JobProfile
from app.models.candidate import Candidate
from app.models.screening_run import ScreeningRun
from app.schemas.screening import CandidateEvaluationResult, ScreeningRunOut
from app.services.candidate_evaluation import evaluate_candidate
from app.services.auth_service import get_current_hr_user

single_router = APIRouter(
    prefix="/jd/profiles/{profile_id}/candidates/{candidate_id}",
    tags=["screening"],
    dependencies=[Depends(get_current_hr_user)],
)

batch_router = APIRouter(
    prefix="/jd/profiles/{profile_id}",
    tags=["screening"],
    dependencies=[Depends(get_current_hr_user)],
)


@single_router.post("/evaluate", response_model=CandidateEvaluationResult)
def evaluate_single_candidate(profile_id: str, candidate_id: str, db: Session = Depends(get_db)):
    profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Job Profile '{profile_id}' not found")

    candidate = (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id, Candidate.job_profile_id == profile_id)
        .first()
    )
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Candidate '{candidate_id}' not found in this profile")

    if candidate.ingestion_status != "documents_complete":
        # Skip evaluation entirely -- don't waste a Gemini call on a
        # candidate whose documents we already know are missing/broken.
        candidate.status = "not_evaluated"
        candidate.computed_status = None
        candidate.status_overridden = False
        candidate.override_reason = None
        candidate.overridden_by = None
        candidate.overridden_at = None
        db.commit()
        return CandidateEvaluationResult(
            candidate_id=candidate.id,
            ingestion_status=candidate.ingestion_status,
            status=candidate.status,
            skipped=True,
            skip_reason=(
                f"Document ingestion is at status '{candidate.ingestion_status}' -- "
                f"evaluation was skipped. Please resolve the document issue first."
            ),
        )

    evaluations = evaluate_candidate(db, candidate, profile)
    db.commit()

    for e in evaluations:
        db.refresh(e)

    return CandidateEvaluationResult(
        candidate_id=candidate.id,
        ingestion_status=candidate.ingestion_status,
        status=candidate.status,
        skipped=False,
        evaluations=evaluations,
    )


def _run_batch_screening(run_id: str, profile_id: str, candidate_ids: list[str]) -> None:
    """
    Runs in the background, after the POST /screen request has already
    returned to the caller. Needs its OWN database session -- the
    request-scoped session from Depends(get_db) is closed by the time this
    function runs.
    """
    db = SessionLocal()
    try:
        run = db.query(ScreeningRun).filter(ScreeningRun.id == run_id).first()
        profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()

        for candidate_id in candidate_ids:
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()

            if candidate is None:
                run.processed_count += 1
                db.commit()
                continue

            try:
                if candidate.ingestion_status != "documents_complete":
                    candidate.status = "not_evaluated"
                    candidate.computed_status = None
                    candidate.status_overridden = False
                    candidate.override_reason = None
                    candidate.overridden_by = None
                    candidate.overridden_at = None
                else:
                    evaluate_candidate(db, candidate, profile)
                db.commit()
            except Exception:
                # A single candidate's failure must never stop the batch --
                # roll back any partial changes for this candidate, mark
                # them not_evaluated, and move on to the next one.
                db.rollback()
                candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
                candidate.status = "not_evaluated"
                run.failed_count += 1
                db.commit()

            run.processed_count += 1
            db.commit()

        run.status = "completed"
        run.completed_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


@batch_router.post("/screen", response_model=ScreeningRunOut)
def start_batch_screening(
    profile_id: str,
    background_tasks: BackgroundTasks,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_hr_user),
):
    """
    Starts screening every eligible candidate for a profile in the
    background, and returns immediately with a run_id. Poll
    GET /jd/profiles/{profile_id}/screening-runs/{run_id} for live progress.

    By default, only candidates still at status="not_evaluated" are
    screened (so re-calling this doesn't waste Gemini calls re-evaluating
    people who already have a result). Pass force=true to re-evaluate
    everyone regardless of current status (e.g. after editing criteria).
    """
    profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Job Profile '{profile_id}' not found")

    query = db.query(Candidate).filter(Candidate.job_profile_id == profile_id)
    if not force:
        query = query.filter(Candidate.status == "not_evaluated")
    candidates = query.all()

    run = ScreeningRun(
        job_profile_id=profile_id,
        total_candidates=len(candidates),
        processed_count=0,
        failed_count=0,
        status="running",
        started_by=current_user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    candidate_ids = [c.id for c in candidates]
    background_tasks.add_task(_run_batch_screening, run.id, profile_id, candidate_ids)

    return run


@batch_router.get("/screening-runs/{run_id}", response_model=ScreeningRunOut)
def get_screening_run_status(profile_id: str, run_id: str, db: Session = Depends(get_db)):
    """Poll this for live progress ('X of Y candidates processed')."""
    run = (
        db.query(ScreeningRun)
        .filter(ScreeningRun.id == run_id, ScreeningRun.job_profile_id == profile_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail=f"Screening run '{run_id}' not found")
    return run
