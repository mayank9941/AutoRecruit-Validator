"""
Dashboard endpoint.

HR flow Step 10: aggregates everything already stored -- total profiles,
candidates per stage, recent JD uploads, and screening run history --
nothing new is computed here, it's purely a read/aggregation over
existing data.
"""

from sqlalchemy import func
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JobProfile, JDUpload
from app.models.candidate import Candidate
from app.models.screening_run import ScreeningRun
from app.schemas.dashboard import DashboardSummary, RecentJDUpload, RecentScreeningRun
from app.services.auth_service import get_current_hr_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_hr_user)])

# Every possible candidate status, so the dashboard always shows all four
# buckets (with a 0 count) even if a profile has no candidates in that
# bucket yet, rather than omitting it entirely.
KNOWN_CANDIDATE_STATUSES = ["eligible", "not_eligible", "needs_review", "not_evaluated"]


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db)):
    total_job_profiles = db.query(JobProfile).filter(JobProfile.is_active == True).count()  # noqa: E712
    total_candidates = db.query(Candidate).count()

    status_counts_raw = (
        db.query(Candidate.status, func.count(Candidate.id))
        .group_by(Candidate.status)
        .all()
    )
    status_counts = {status: 0 for status in KNOWN_CANDIDATE_STATUSES}
    for status, count in status_counts_raw:
        status_counts[status] = count

    recent_uploads = (
        db.query(JDUpload)
        .order_by(JDUpload.uploaded_at.desc())
        .limit(10)
        .all()
    )
    recent_jd_uploads = [
        RecentJDUpload(
            id=upload.id,
            filename=upload.filename,
            uploaded_at=upload.uploaded_at,
            post_count=len(upload.job_profiles),
        )
        for upload in recent_uploads
    ]

    recent_runs = (
        db.query(ScreeningRun)
        .order_by(ScreeningRun.started_at.desc())
        .limit(10)
        .all()
    )
    recent_screening_runs = [
        RecentScreeningRun(
            id=run.id,
            job_profile_id=run.job_profile_id,
            job_profile_title=run.job_profile.title if run.job_profile else "(deleted profile)",
            status=run.status,
            total_candidates=run.total_candidates,
            processed_count=run.processed_count,
            failed_count=run.failed_count,
            started_at=run.started_at,
            completed_at=run.completed_at,
        )
        for run in recent_runs
    ]

    return DashboardSummary(
        total_job_profiles=total_job_profiles,
        total_candidates=total_candidates,
        candidates_by_status=status_counts,
        recent_jd_uploads=recent_jd_uploads,
        recent_screening_runs=recent_screening_runs,
    )
