"""
Results endpoint -- shows candidates grouped/filtered by their final
screening status (Eligible / Not Eligible / Needs Review / Not Evaluated),
plus an Excel export sorted with Eligible candidates first.
"""

import io
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JobProfile
from app.models.candidate import Candidate
from app.schemas.results import ResultsResponse, ResultsSummary
from app.services.auth_service import get_current_hr_user

router = APIRouter(
    prefix="/jd/profiles/{profile_id}/results",
    tags=["results"],
    dependencies=[Depends(get_current_hr_user)],
)

# Eligible candidates should always appear first, followed by Needs Review,
# then Not Eligible, then anyone not yet evaluated.
STATUS_SORT_ORDER = {
    "eligible": 0,
    "needs_review": 1,
    "not_eligible": 2,
    "not_evaluated": 3,
}


def _get_profile_or_404(profile_id: str, db: Session) -> JobProfile:
    profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Job Profile '{profile_id}' not found")
    return profile


def _build_summary(all_candidates: list[Candidate]) -> ResultsSummary:
    return ResultsSummary(
        total=len(all_candidates),
        eligible=sum(1 for c in all_candidates if c.status == "eligible"),
        not_eligible=sum(1 for c in all_candidates if c.status == "not_eligible"),
        needs_review=sum(1 for c in all_candidates if c.status == "needs_review"),
        not_evaluated=sum(1 for c in all_candidates if c.status == "not_evaluated"),
    )


@router.get("", response_model=ResultsResponse)
def get_results(
    profile_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Returns a summary of candidate counts by status, plus the candidate
    list sorted with Eligible first. Pass ?status=eligible (or
    not_eligible / needs_review / not_evaluated) to filter to just one
    bucket.
    """
    _get_profile_or_404(profile_id, db)

    all_candidates = db.query(Candidate).filter(Candidate.job_profile_id == profile_id).all()
    summary = _build_summary(all_candidates)

    filtered = all_candidates if status is None else [c for c in all_candidates if c.status == status]
    sorted_candidates = sorted(filtered, key=lambda c: STATUS_SORT_ORDER.get(c.status, 99))

    return ResultsResponse(summary=summary, candidates=sorted_candidates)


@router.get("/export")
def export_results(
    profile_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Exports candidates to an Excel file, sorted with Eligible first.
    Pass ?status=... to export just one bucket instead of everyone.
    """
    profile = _get_profile_or_404(profile_id, db)

    all_candidates = db.query(Candidate).filter(Candidate.job_profile_id == profile_id).all()
    filtered = all_candidates if status is None else [c for c in all_candidates if c.status == status]
    sorted_candidates = sorted(filtered, key=lambda c: STATUS_SORT_ORDER.get(c.status, 99))

    rows = [
        {
            "Candidate ID": c.external_id,
            "Name": c.name,
            "Email": c.email,
            "Phone": c.phone,
            "Status": c.status.replace("_", " ").title(),
        }
        for c in sorted_candidates
    ]

    df = pd.DataFrame(rows, columns=["Candidate ID", "Name", "Email", "Phone", "Status"])

    output = io.BytesIO()
    df.to_excel(output, index=False, engine="openpyxl", sheet_name="Results")
    output.seek(0)

    safe_title = "".join(c if c.isalnum() else "_" for c in profile.title)[:50]
    filename = f"results_{safe_title}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
