"""
Candidate upload endpoint.

HR selects a specific Job Profile, then uploads:
  1. The candidate master data file (Excel/tab-separated export)
  2. A master ZIP containing one nested ZIP per candidate

This endpoint ingests everything: matches each candidate to their Excel
row, extracts + tags their documents, and saves it all to the database --
ready for the (future) screening/evaluation step. This is HR flow Step 5:
"Select a specific profile, then screen candidates" (upload part).
"""

import os
import uuid

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job_profile import JobProfile
from app.models.candidate import Candidate, CandidateDocument
from app.models.criterion_evaluation import CriterionEvaluation
from app.schemas.candidate import CandidateUploadSummary, CandidateOut
from app.services.candidate_ingestion import load_candidate_master_data, process_master_zip
from app.services.pdf_extraction import extract_marked_pdf_text, pdf_text_is_meaningful
from app.services.auth_service import get_current_hr_user

router = APIRouter(
    prefix="/jd/profiles/{profile_id}/candidates",
    tags=["candidates"],
    dependencies=[Depends(get_current_hr_user)],
)

UPLOAD_DIR = os.path.abspath(os.getenv("CANDIDATE_UPLOAD_DIR", "storage/candidate_uploads"))


def _delete_candidate_screening_data(db: Session, candidate_id: str) -> None:
    """
    Removes a candidate's screening artifacts (criterion evaluations).
    Used when a candidate is re-uploaded: the old results were computed
    against their OLD documents, so keeping them would show stale (and,
    before this existed, duplicate) results.
    """
    db.query(CriterionEvaluation).filter(
        CriterionEvaluation.candidate_id == candidate_id
    ).delete(synchronize_session=False)


@router.post("/upload", response_model=CandidateUploadSummary)
async def upload_candidates(
    profile_id: str,
    excel_file: UploadFile = File(...),
    master_zip_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    profile = db.query(JobProfile).filter(JobProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Job Profile '{profile_id}' not found")

    # Save both uploaded files to disk first -- pandas and zipfile need
    # real file paths to work with (not in-memory upload streams), and
    # we want a persistent per-batch folder anyway to store documents in.
    batch_dir = os.path.join(UPLOAD_DIR, str(uuid.uuid4()))
    os.makedirs(batch_dir, exist_ok=True)

    excel_path = os.path.join(batch_dir, excel_file.filename)
    with open(excel_path, "wb") as f:
        f.write(await excel_file.read())

    zip_path = os.path.join(batch_dir, master_zip_file.filename)
    with open(zip_path, "wb") as f:
        f.write(await master_zip_file.read())

    try:
        df = load_candidate_master_data(excel_path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse the candidate data file: {e}")

    if "Id." not in df.columns:
        raise HTTPException(
            status_code=422,
            detail="No 'Id.' column found in the uploaded file -- candidate matching cannot proceed without it.",
        )

    documents_storage_dir = os.path.join(batch_dir, "documents")

    try:
        results = process_master_zip(df, zip_path, documents_storage_dir)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not process the master ZIP: {e}")

    status_counts = {
        "documents_complete": 0,
        "documents_incomplete": 0,
        "no_documents_found": 0,
        "excel_row_not_found": 0,
        "corrupt_zip": 0,
    }
    created_candidates: list[Candidate] = []
    replaced_candidates = 0

    for r in results:
        status_counts[r["ingestion_status"]] = status_counts.get(r["ingestion_status"], 0) + 1

        # UPSERT by the Excel "Id." column: the same candidate re-uploaded
        # to the same profile REPLACES their existing record (fresh data +
        # fresh documents, old screening results wiped) instead of creating
        # a duplicate that would show up twice in Results.
        existing = (
            db.query(Candidate)
            .filter(
                Candidate.job_profile_id == profile.id,
                Candidate.external_id == r["external_id"],
            )
            .order_by(Candidate.created_at)
            .all()
        )

        if existing:
            candidate = existing[0]

            # Duplicates left behind by re-uploads made BEFORE this upsert
            # existed -- absorb them into the one surviving record.
            for duplicate in existing[1:]:
                _delete_candidate_screening_data(db, duplicate.id)
                db.delete(duplicate)  # cascade removes its document rows

            # Old evaluations/verifications were computed against the old
            # upload's documents -- they must not linger next to new data.
            _delete_candidate_screening_data(db, candidate.id)

            candidate.name = r.get("name")
            candidate.email = r.get("email")
            candidate.phone = r.get("phone")
            candidate.dob = r.get("dob")
            candidate.gender = r.get("gender")
            candidate.raw_category = r.get("raw_category")
            candidate.normalized_category = r.get("normalized_category")
            candidate.raw_excel_data = r.get("raw_excel_data")
            candidate.ingestion_status = r["ingestion_status"]

            # Back to "not screened yet" -- the next screening run will
            # produce fresh results against the new documents.
            candidate.computed_status = None
            candidate.status = "not_evaluated"
            candidate.status_overridden = False
            candidate.override_reason = None
            candidate.overridden_by = None
            candidate.overridden_at = None

            candidate.documents.clear()  # delete-orphan cascade drops old rows
            db.flush()
            replaced_candidates += 1
        else:
            # Even for candidates we couldn't fully process (missing Excel
            # row, corrupt ZIP), we still create a minimal Candidate record --
            # this keeps the batch fully visible during review, instead of
            # silently dropping candidates that had a problem.
            candidate = Candidate(
                job_profile_id=profile.id,
                external_id=r["external_id"],
                name=r.get("name"),
                email=r.get("email"),
                phone=r.get("phone"),
                dob=r.get("dob"),
                gender=r.get("gender"),
                raw_category=r.get("raw_category"),
                normalized_category=r.get("normalized_category"),
                raw_excel_data=r.get("raw_excel_data"),
                ingestion_status=r["ingestion_status"],
            )
            db.add(candidate)
            db.flush()

        for doc_type, local_path in r.get("matched_documents", {}).items():
            original_filename = os.path.basename(local_path)

            # Extract the document's page-marked text NOW, once, so
            # screening runs never have to re-parse PDFs (that re-parsing
            # was a significant part of why screening was slow).
            if local_path.lower().endswith(".pdf"):
                try:
                    extracted_text = extract_marked_pdf_text(local_path, original_filename)
                    if not pdf_text_is_meaningful(extracted_text):
                        # Scanned/image PDF with no text layer. Leave NULL so
                        # screening runs the Gemini-vision OCR fallback (in
                        # the background, in parallel) and caches the result
                        # -- doing OCR here would make uploads very slow.
                        extracted_text = None
                except Exception:
                    extracted_text = None  # corrupt? let the OCR path try once more
            else:
                extracted_text = ""  # photos/signatures carry no evaluable text

            db.add(CandidateDocument(
                candidate_id=candidate.id,
                document_type=doc_type,
                file_path=local_path,
                original_filename=original_filename,
                extracted_text=extracted_text,
            ))

        created_candidates.append(candidate)

    db.commit()
    for c in created_candidates:
        db.refresh(c)

    return CandidateUploadSummary(
        job_profile_id=profile.id,
        total_candidates_found=len(results),
        replaced_candidates=replaced_candidates,
        documents_complete=status_counts["documents_complete"],
        documents_incomplete=status_counts["documents_incomplete"],
        no_documents_found=status_counts["no_documents_found"],
        excel_row_not_found=status_counts["excel_row_not_found"],
        corrupt_zip=status_counts["corrupt_zip"],
        candidates=created_candidates,
    )


@router.get("", response_model=list[CandidateOut])
def list_candidates(profile_id: str, db: Session = Depends(get_db)):
    """Lists all candidates uploaded so far for a given Job Profile."""
    return db.query(Candidate).filter(Candidate.job_profile_id == profile_id).all()
