"""
JD Upload endpoint.

Flow: PDF upload -> text extraction -> Gemini structured parsing -> validate
-> create JDUpload + JobProfile(s) + Criterion(s) + AgeRelaxationRule(s) in
the DB -> return response.

This is the backend for HR flow Steps 2-3 (JD upload -> Job Profiles
auto-created).
"""

import os
import uuid
import hashlib

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JDUpload, JobProfile, Criterion, AgeRelaxationRule
from app.schemas.job_profile import JDUploadResponse
from app.services.pdf_extraction import extract_text_from_pdf
from app.services.gemini_service import parse_jd_with_gemini, GeminiParsingError
from app.services.age_relaxation import (
    normalize_category,
    parse_age_range,
    validate_gemini_output,
)
from app.services.auth_service import get_current_hr_user
from app.services.criteria_utils import is_essential_from_description

router = APIRouter(prefix="/jd", tags=["jd-upload"], dependencies=[Depends(get_current_hr_user)])

UPLOAD_DIR = os.path.abspath(os.getenv("JD_UPLOAD_DIR", "storage/jd_uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=JDUploadResponse)
def upload_jd(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # Plain `def` (not async): the PDF extraction + Gemini call below are
    # blocking and can take a while -- as a sync endpoint Starlette runs
    # this on a worker thread, so long uploads don't freeze the event loop
    # (which made every other request, including progress polling, hang).
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files can be uploaded right now")

    # ---- 1. Read the file and compute its hash (for duplicate detection) ----
    contents = file.file.read()
    file_hash = hashlib.sha256(contents).hexdigest()

    existing_upload = db.query(JDUpload).filter(JDUpload.file_hash == file_hash).first()
    if existing_upload:
        # This exact file has already been uploaded before -- don't create
        # a new profile, just return the existing ones so HR knows it's a
        # duplicate (re-processing the same JD would be wasted work, and
        # would create duplicate Job Profiles in the DB).
        existing_profiles = (
            db.query(JobProfile)
            .filter(JobProfile.source_jd_upload_id == existing_upload.id)
            .all()
        )
        return JDUploadResponse(
            jd_upload_id=existing_upload.id,
            filename=existing_upload.filename,
            parse_confidence=existing_upload.parse_confidence or "",
            ambiguity_notes=existing_upload.ambiguity_notes or "",
            post_count=len(existing_profiles),
            validation_warnings=[],
            is_duplicate=True,
            duplicate_message=(
                f"This file was already uploaded before (originally as "
                f"'{existing_upload.filename}', on {existing_upload.uploaded_at.strftime('%d-%m-%Y %H:%M')}). "
                f"No new profile was created -- the existing profiles are shown below."
            ),
            job_profiles=existing_profiles,
        )

    # ---- 2. Save the file to disk (this is a new upload) ----
    file_id = str(uuid.uuid4())
    storage_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    with open(storage_path, "wb") as f:
        f.write(contents)

    # ---- 3. Extract text from the PDF ----
    jd_text = extract_text_from_pdf(storage_path)
    if not jd_text.strip():
        raise HTTPException(
            status_code=422,
            detail="No text could be extracted from the PDF -- this might be a scanned image PDF. "
                   "OCR support isn't available yet.",
        )

    # ---- 4. Structured extraction via Gemini ----
    try:
        gemini_result = parse_jd_with_gemini(jd_text)
    except GeminiParsingError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # ---- 5. Rule-based guardrails ----
    validation_warnings = validate_gemini_output(gemini_result)

    # ---- 6. Create the JDUpload record in the DB ----
    jd_upload = JDUpload(
        filename=file.filename,
        storage_path=storage_path,
        file_hash=file_hash,
        raw_extracted_text=jd_text,
        gemini_raw_response=gemini_result,
        parse_confidence=gemini_result.get("confidence", "low"),
        ambiguity_notes=gemini_result.get("ambiguity_notes", ""),
    )
    db.add(jd_upload)
    db.flush()  # need the id to create JobProfile rows; not committing yet

    # ---- 7. Create a JobProfile + Criteria + AgeRelaxation for each detected post ----
    created_profiles: list[JobProfile] = []
    age_relax_data = gemini_result.get("age_relaxation", {})

    for post_index, post in enumerate(gemini_result.get("posts", [])):
        base_age_min, base_age_max = None, None
        for crit in post.get("criteria", []):
            if crit.get("type") == "age":
                base_age_min, base_age_max = parse_age_range(crit.get("description", ""))
                break  # treat the first age criterion as the base age

        profile = JobProfile(
            source_jd_upload_id=jd_upload.id,
            title=post.get("title", "").strip() or "Untitled Post",
            base_age_min=base_age_min,
            base_age_max=base_age_max,
            source_post_index=post_index,
        )
        db.add(profile)
        db.flush()

        for idx, crit in enumerate(post.get("criteria", [])):
            description = crit.get("description", "")
            db.add(Criterion(
                job_profile_id=profile.id,
                type=crit.get("type", "other"),
                description=description,
                is_essential=is_essential_from_description(description, crit.get("type", "other")),
                display_order=idx,
                source_index=idx,
            ))

        if age_relax_data.get("mentioned_in_jd"):
            for rule in age_relax_data.get("rules", []):
                raw_cat = rule.get("category", "")
                db.add(AgeRelaxationRule(
                    job_profile_id=profile.id,
                    raw_category=raw_cat,
                    normalized_category=normalize_category(raw_cat),
                    relaxation_text=rule.get("relaxation", ""),
                ))

        created_profiles.append(profile)

    db.commit()

    # Refresh to load relationships (criteria, age_relaxation_rules)
    for p in created_profiles:
        db.refresh(p)

    return JDUploadResponse(
        jd_upload_id=jd_upload.id,
        filename=jd_upload.filename,
        parse_confidence=jd_upload.parse_confidence,
        ambiguity_notes=jd_upload.ambiguity_notes or "",
        post_count=len(created_profiles),
        validation_warnings=validation_warnings,
        job_profiles=created_profiles,
    )
