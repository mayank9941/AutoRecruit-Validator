"""
Document verification endpoints.

HR flow Step 9: candidates who passed screening ("eligible") move to a
document verification step -- their identity details are re-extracted
from a source document and compared against their form data. Any
mismatch or low-confidence extraction is flagged for HR to manually
verify or reject, with notes.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JobProfile
from app.models.candidate import Candidate
from app.models.document_verification import DocumentVerification
from app.schemas.document_verification import (
    CandidateVerificationSummary,
    DocumentVerificationOut,
    VerificationDecisionRequest,
)
from app.services.document_verification import verify_candidate_identity
from app.services.auth_service import get_current_hr_user

router = APIRouter(
    prefix="/jd/profiles/{profile_id}/candidates/{candidate_id}",
    tags=["verification"],
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


@router.post("/verify", response_model=CandidateVerificationSummary)
def run_candidate_verification(profile_id: str, candidate_id: str, db: Session = Depends(get_db)):
    """
    Runs identity verification for one candidate. Only allowed for
    candidates whose current status is "eligible" -- verification is a
    post-screening step, not a substitute for it.
    """
    profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Job Profile '{profile_id}' not found")

    candidate = _get_candidate_or_404(profile_id, candidate_id, db)

    if candidate.status != "eligible":
        return CandidateVerificationSummary(
            candidate_id=candidate.id,
            skipped=True,
            skip_reason=(
                f"Candidate's current status is '{candidate.status}', not 'eligible' -- "
                f"verification only applies to candidates who passed screening."
            ),
        )

    # Clear any previous verification records for this candidate before
    # re-running, so re-verification doesn't pile up duplicate rows.
    db.query(DocumentVerification).filter(DocumentVerification.candidate_id == candidate_id).delete()

    verifications = verify_candidate_identity(db, candidate)
    db.commit()

    for v in verifications:
        db.refresh(v)

    return CandidateVerificationSummary(candidate_id=candidate.id, skipped=False, verifications=verifications)


@router.get("/verification", response_model=CandidateVerificationSummary)
def get_candidate_verification(profile_id: str, candidate_id: str, db: Session = Depends(get_db)):
    """Fetches the current verification results for a candidate (without re-running them)."""
    candidate = _get_candidate_or_404(profile_id, candidate_id, db)

    verifications = (
        db.query(DocumentVerification)
        .filter(DocumentVerification.candidate_id == candidate_id)
        .all()
    )
    return CandidateVerificationSummary(candidate_id=candidate.id, skipped=False, verifications=verifications)


@router.patch("/verification/{verification_id}/decision", response_model=DocumentVerificationOut)
def decide_verification(
    profile_id: str,
    candidate_id: str,
    verification_id: str,
    payload: VerificationDecisionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_hr_user),
):
    """Lets HR verify or reject one specific field-level verification result, with notes."""
    _get_candidate_or_404(profile_id, candidate_id, db)

    verification = (
        db.query(DocumentVerification)
        .filter(DocumentVerification.id == verification_id, DocumentVerification.candidate_id == candidate_id)
        .first()
    )
    if not verification:
        raise HTTPException(status_code=404, detail=f"Verification record '{verification_id}' not found")

    verification.hr_decision = payload.decision
    verification.hr_notes = payload.notes
    verification.verified_by = current_user.id
    verification.verified_at = datetime.utcnow()

    db.commit()
    db.refresh(verification)

    return verification
