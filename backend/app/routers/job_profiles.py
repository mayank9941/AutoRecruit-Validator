"""
Job Profiles listing/detail + Criteria Editor endpoints.

This is HR flow Step 4 -- "Review/edit criteria (optional)" -- where HR
opens a profile and can view/edit/add/delete its criteria.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JobProfile, Criterion
from app.schemas.job_profile import JobProfileOut, CriterionOut, CriterionCreate, CriterionUpdate
from app.services.auth_service import get_current_hr_user

router = APIRouter(prefix="/jd/profiles", tags=["job-profiles"], dependencies=[Depends(get_current_hr_user)])


def _get_profile_or_404(profile_id: str, db: Session) -> JobProfile:
    profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Job Profile '{profile_id}' not found")
    return profile


def _get_criterion_or_404(profile_id: str, criterion_id: str, db: Session) -> Criterion:
    criterion = (
        db.query(Criterion)
        .filter(Criterion.id == criterion_id, Criterion.job_profile_id == profile_id)
        .first()
    )
    if not criterion:
        raise HTTPException(
            status_code=404,
            detail=f"Criterion '{criterion_id}' not found in this profile",
        )
    return criterion


# ---- Listing + detail ----

@router.get("", response_model=list[JobProfileOut])
def list_job_profiles(db: Session = Depends(get_db)):
    """For the Job Profiles list screen -- satisfies the 'no dropdown, no
    manual re-upload' requirement (profiles should appear here immediately
    once a JD is uploaded)."""
    profiles = db.query(JobProfile).filter(JobProfile.is_active == True).all()  # noqa: E712
    return profiles


@router.get("/{profile_id}", response_model=JobProfileOut)
def get_job_profile(profile_id: str, db: Session = Depends(get_db)):
    """Full detail for one profile -- the Criteria Editor screen loads its data from here."""
    return _get_profile_or_404(profile_id, db)


# ---- Criteria Editor: add / edit / delete ----

@router.post("/{profile_id}/criteria", response_model=CriterionOut, status_code=201)
def add_criterion(profile_id: str, payload: CriterionCreate, db: Session = Depends(get_db)):
    """Lets HR manually add a new criterion (e.g. if Gemini missed
    something, or HR wants to add an extra custom rule)."""
    profile = _get_profile_or_404(profile_id, db)

    display_order = payload.display_order
    if display_order is None:
        # Append to the end of the existing criteria list
        max_order = max((c.display_order for c in profile.criteria), default=-1)
        display_order = max_order + 1

    criterion = Criterion(
        job_profile_id=profile.id,
        type=payload.type,
        description=payload.description,
        is_essential=payload.is_essential,
        display_order=display_order,
    )
    db.add(criterion)
    db.commit()
    db.refresh(criterion)
    return criterion


@router.patch("/{profile_id}/criteria/{criterion_id}", response_model=CriterionOut)
def update_criterion(
    profile_id: str,
    criterion_id: str,
    payload: CriterionUpdate,
    db: Session = Depends(get_db),
):
    """Partial update -- HR only needs to send the fields they want to
    change (fixing a description, changing the type, toggling
    essential/desirable, etc.)."""
    criterion = _get_criterion_or_404(profile_id, criterion_id, db)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(criterion, field, value)

    db.commit()
    db.refresh(criterion)
    return criterion


@router.delete("/{profile_id}/criteria/{criterion_id}", status_code=204)
def delete_criterion(profile_id: str, criterion_id: str, db: Session = Depends(get_db)):
    """Permanently deletes a criterion. If an audit trail of what HR
    deleted is needed in the future, this can be changed to a soft-delete
    (an is_active flag) instead -- a hard delete is simple and fine for now."""
    criterion = _get_criterion_or_404(profile_id, criterion_id, db)
    db.delete(criterion)
    db.commit()
    return None
