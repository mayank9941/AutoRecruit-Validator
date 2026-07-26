"""
Job Profiles listing/detail + Criteria Editor endpoints.

This is HR flow Step 4 -- "Review/edit criteria (optional)" -- where HR
opens a profile and can view/edit/add/delete its criteria.
"""

import os
import shutil

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JobProfile, Criterion, JDUpload
from app.models.candidate import Candidate, CandidateDocument
from app.models.criterion_evaluation import CriterionEvaluation
from app.models.screening_run import ScreeningRun
from app.schemas.job_profile import (
    JobProfileOut,
    CriterionOut,
    CriterionCreate,
    CriterionUpdate,
    CriteriaRestoreResponse,
)
from app.services.auth_service import get_current_hr_user
from app.services.criteria_utils import is_essential_from_description

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


@router.delete("/{profile_id}")
def delete_job_profile(profile_id: str, db: Session = Depends(get_db)):
    """
    Permanently deletes a Job Profile and EVERYTHING associated with it:
    candidates, their documents, criterion evaluations, document
    verifications, screening runs, criteria and age relaxation rules.

    If this was the last profile from its JD upload, the JD upload record
    is deleted too -- which frees its file hash, so the same JD PDF can be
    uploaded again and re-parsed fresh.
    """
    profile = _get_profile_or_404(profile_id, db)

    candidate_ids = [
        row[0]
        for row in db.query(Candidate.id).filter(Candidate.job_profile_id == profile_id).all()
    ]

    # Collect per-candidate document folders for best-effort disk cleanup
    # AFTER the DB commit succeeds.
    document_dirs = set()
    if candidate_ids:
        for (file_path,) in (
            db.query(CandidateDocument.file_path)
            .filter(CandidateDocument.candidate_id.in_(candidate_ids))
            .all()
        ):
            document_dirs.add(os.path.dirname(file_path))

    # Children first (FKs have no ON DELETE CASCADE), then the profile.
    if candidate_ids:
        db.query(CriterionEvaluation).filter(
            CriterionEvaluation.candidate_id.in_(candidate_ids)
        ).delete(synchronize_session=False)
        db.query(CandidateDocument).filter(
            CandidateDocument.candidate_id.in_(candidate_ids)
        ).delete(synchronize_session=False)
        db.query(Candidate).filter(Candidate.job_profile_id == profile_id).delete(
            synchronize_session=False
        )
    db.query(ScreeningRun).filter(ScreeningRun.job_profile_id == profile_id).delete(
        synchronize_session=False
    )

    jd_upload = profile.source_jd_upload
    db.delete(profile)  # cascade removes criteria + age relaxation rules
    db.flush()

    jd_upload_deleted = False
    jd_pdf_path = None
    if jd_upload is not None:
        remaining = (
            db.query(JobProfile).filter(JobProfile.source_jd_upload_id == jd_upload.id).count()
        )
        if remaining == 0:
            jd_pdf_path = jd_upload.storage_path
            db.delete(jd_upload)
            jd_upload_deleted = True

    db.commit()

    # Best-effort disk cleanup -- DB state is already consistent, so a
    # failure to remove files must not fail the request.
    for directory in document_dirs:
        try:
            shutil.rmtree(directory)
        except OSError:
            pass
    if jd_pdf_path:
        try:
            os.remove(jd_pdf_path)
        except OSError:
            pass

    return {
        "deleted_profile_id": profile_id,
        "deleted_candidates": len(candidate_ids),
        "jd_upload_deleted": jd_upload_deleted,
    }


@router.get("/{profile_id}", response_model=JobProfileOut)
def get_job_profile(profile_id: str, db: Session = Depends(get_db)):
    """Full detail for one profile -- the Criteria Editor screen loads its data from here."""
    return _get_profile_or_404(profile_id, db)


# ---- Criteria Editor: add / edit / delete ----

@router.post("/{profile_id}/criteria", response_model=CriterionOut, status_code=201)
def add_criterion(profile_id: str, payload: CriterionCreate, db: Session = Depends(get_db)):
    """Lets HR manually add a new criterion (e.g. if Gemini missed
    something, or HR wants to add an extra custom rule).

    If the profile had been soft-deleted (is_active = False) because its
    last criterion was previously removed, adding a criterion back
    reactivates it -- the profile now has something to screen against
    again, so it belongs in the active Job Profiles list once more.
    """
    profile = _get_profile_or_404(profile_id, db)

    if not profile.is_active:
        profile.is_active = True

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
        required_match_percentage=payload.required_match_percentage,
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
    """
    Permanently deletes a criterion. If an audit trail of what HR deleted
    is needed in the future, this can be changed to a soft-delete (an
    is_active flag) instead -- a hard delete is simple and fine for now.

    If this was the profile's LAST criterion, the profile itself is
    soft-deleted (is_active = False) -- a profile with zero criteria has
    nothing to screen candidates against, so it shouldn't stay visible in
    the active Job Profiles list. The profile row is kept (not hard
    deleted) since candidates may already reference it via foreign key.
    """
    criterion = _get_criterion_or_404(profile_id, criterion_id, db)
    profile = criterion.job_profile

    db.delete(criterion)
    db.flush()  # so the count below reflects the deletion

    remaining_count = (
        db.query(Criterion).filter(Criterion.job_profile_id == profile_id).count()
    )
    if remaining_count == 0:
        profile.is_active = False

    db.commit()
    return None


def _get_source_criteria_or_422(profile: JobProfile) -> list[dict]:
    """
    Fetches the original Gemini-parsed criteria list for a profile's
    source post, from the stored gemini_raw_response on its JD upload.
    Shared by both /criteria/restore and /criteria/{id}/revert, since
    both need the same "find my original data" step.
    """
    jd_upload = profile.source_jd_upload

    if profile.source_post_index is None or not jd_upload or not jd_upload.gemini_raw_response:
        raise HTTPException(
            status_code=422,
            detail=(
                "No stored source data available for this profile "
                "(it may have been created before restore/revert support was added)."
            ),
        )

    posts = jd_upload.gemini_raw_response.get("posts", [])
    if profile.source_post_index >= len(posts):
        raise HTTPException(
            status_code=422,
            detail="The stored source data doesn't match this profile's expected post position.",
        )

    return posts[profile.source_post_index].get("criteria", [])


@router.post("/{profile_id}/criteria/restore", response_model=CriteriaRestoreResponse)
def restore_deleted_criteria(profile_id: str, db: Session = Depends(get_db)):
    """
    Re-creates any criteria that were deleted from this profile, using the
    original Gemini-parsed data stored on the source JD upload
    (jd_upload.gemini_raw_response) -- no new Gemini call is made.

    Matching "still present" vs. "was deleted" is done by source_index
    (the criterion's position in the original post's criteria list, set
    once at creation time and never changed afterward) rather than by
    comparing description text -- a description match would incorrectly
    treat an HR-edited criterion as "different from the original" and
    restore a duplicate alongside it. Criteria HR added manually (which
    have no source_index) are left untouched either way, since there's
    nothing in the raw response to compare them against.

    Note: this endpoint deliberately does NOT touch criteria that are
    still present but have been edited -- it only fills in what's
    missing. To reset a single edited-but-not-deleted criterion back to
    its original wording, use POST .../criteria/{criterion_id}/revert
    instead.

    Only works for profiles created after source_post_index/source_index
    tracking was added -- profiles from before that will have
    source_post_index = None and get a 422 explaining why.
    """
    profile = _get_profile_or_404(profile_id, db)
    source_criteria = _get_source_criteria_or_422(profile)

    existing_source_indices = {
        c.source_index for c in profile.criteria if c.source_index is not None
    }

    max_display_order = max((c.display_order for c in profile.criteria), default=-1)

    restored: list[Criterion] = []
    for idx, crit in enumerate(source_criteria):
        if idx in existing_source_indices:
            continue  # still present in the DB, nothing to restore

        max_display_order += 1
        description = crit.get("description", "")
        new_criterion = Criterion(
            job_profile_id=profile.id,
            type=crit.get("type", "other"),
            description=description,
            is_essential=is_essential_from_description(description, crit.get("type", "other")),
            display_order=max_display_order,
            source_index=idx,
        )
        db.add(new_criterion)
        restored.append(new_criterion)

    if restored and not profile.is_active:
        # A profile that had every criterion deleted (and was therefore
        # soft-deleted per Part 1's behavior) becomes usable again once
        # any criteria are restored to it.
        profile.is_active = True

    db.commit()
    for c in restored:
        db.refresh(c)
    db.refresh(profile)

    return CriteriaRestoreResponse(restored_count=len(restored), profile=profile)


@router.post("/{profile_id}/criteria/{criterion_id}/revert", response_model=CriterionOut)
def revert_criterion_to_original(profile_id: str, criterion_id: str, db: Session = Depends(get_db)):
    """
    Resets a single criterion that is STILL PRESENT (not deleted) back to
    its original Gemini-parsed wording -- undoes an HR edit, in other
    words. This is different from /criteria/restore, which only re-creates
    criteria that were deleted; this endpoint targets one existing row and
    overwrites it in place, rather than creating a new one.

    Only works for criteria that have a source_index (i.e. came from a
    Gemini parse, not manually added by HR) -- manually-added criteria
    have no "original" to revert to, and get a 422 explaining why.
    """
    profile = _get_profile_or_404(profile_id, db)
    criterion = _get_criterion_or_404(profile_id, criterion_id, db)

    if criterion.source_index is None:
        raise HTTPException(
            status_code=422,
            detail="This criterion was added manually and has no original version to revert to.",
        )

    source_criteria = _get_source_criteria_or_422(profile)

    if criterion.source_index >= len(source_criteria):
        raise HTTPException(
            status_code=422,
            detail="The stored source data doesn't contain this criterion's original position anymore.",
        )

    original = source_criteria[criterion.source_index]
    original_description = original.get("description", "")

    criterion.type = original.get("type", "other")
    criterion.description = original_description
    criterion.is_essential = is_essential_from_description(original_description, original.get("type", "other"))
    # display_order is intentionally left as-is -- reverting content
    # shouldn't also silently reorder the list.

    db.commit()
    db.refresh(criterion)
    return criterion
