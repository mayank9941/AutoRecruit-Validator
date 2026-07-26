"""
Manual Review endpoints.

HR flow Step 8: candidates flagged "needs_review" (or any candidate,
really) are shown with a full criterion-by-criterion breakdown, so HR can
make the final call and override the status if needed.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JobProfile
from app.models.candidate import Candidate
from app.models.criterion_evaluation import CriterionEvaluation
from app.schemas.review import (
    CandidateReviewDetail,
    CriterionEvaluationDetail,
    OverrideRequest,
    OverrideResponse,
)
from app.services.auth_service import get_current_hr_user

router = APIRouter(
    prefix="/jd/profiles/{profile_id}/candidates/{candidate_id}",
    tags=["review"],
    dependencies=[Depends(get_current_hr_user)],
)


def _get_candidate_or_404(profile_id: str, candidate_id: str, db: Session) -> Candidate:
    candidate = (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id, Candidate.job_profile_id == profile_id)
        .first()
    )
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Candidate '{candidate_id}' not found in this profile")
    return candidate


@router.get("/review", response_model=CandidateReviewDetail)
def get_candidate_review(profile_id: str, candidate_id: str, db: Session = Depends(get_db)):
    """
    Full criterion-by-criterion breakdown for one candidate -- each
    criterion's result, citation, and reasoning, plus the candidate's
    computed status and any HR override that's been applied.
    """
    profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Job Profile '{profile_id}' not found")

    candidate = _get_candidate_or_404(profile_id, candidate_id, db)

    evaluations = (
        db.query(CriterionEvaluation)
        .filter(CriterionEvaluation.candidate_id == candidate_id)
        .all()
    )
    # Sort by the criterion's own display order, so the breakdown reads in
    # the same order HR sees criteria in the Criteria Editor.
    evaluations.sort(key=lambda e: e.criterion.display_order)

    evaluation_details = [
        CriterionEvaluationDetail(
            criterion_id=e.criterion_id,
            criterion_type=e.criterion.type,
            criterion_description=e.criterion.description,
            is_essential=e.criterion.is_essential,
            result=e.result,
            match_percentage=e.match_percentage,
            citation_document=e.citation_document,
            citation_page=e.citation_page,
            reasoning=e.reasoning,
        )
        for e in evaluations
    ]

    return CandidateReviewDetail(
        candidate_id=candidate.id,
        name=candidate.name,
        email=candidate.email,
        ingestion_status=candidate.ingestion_status,
        computed_status=candidate.computed_status,
        status=candidate.status,
        status_overridden=candidate.status_overridden,
        override_reason=candidate.override_reason,
        overridden_by=candidate.overridden_by,
        overridden_at=candidate.overridden_at,
        evaluations=evaluation_details,
    )


@router.patch("/override", response_model=OverrideResponse)
def override_candidate_status(
    profile_id: str,
    candidate_id: str,
    payload: OverrideRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_hr_user),
):
    """
    Lets HR manually set the final status for a candidate, overriding
    whatever the automated evaluation computed. The original computed
    status stays visible separately (candidate.computed_status) -- this
    only changes the EFFECTIVE status that Results/Dashboard will show.
    """
    candidate = _get_candidate_or_404(profile_id, candidate_id, db)

    candidate.status = payload.new_status
    candidate.status_overridden = True
    candidate.override_reason = payload.reason
    candidate.overridden_by = current_user.id
    candidate.overridden_at = datetime.utcnow()

    db.commit()
    db.refresh(candidate)

    return OverrideResponse(
        candidate_id=candidate.id,
        status=candidate.status,
        status_overridden=candidate.status_overridden,
        override_reason=candidate.override_reason,
        overridden_by=candidate.overridden_by,
        overridden_at=candidate.overridden_at,
    )
