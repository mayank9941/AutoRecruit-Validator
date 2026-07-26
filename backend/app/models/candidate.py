"""
Candidate + CandidateDocument models.

A Candidate belongs to one JobProfile (they were uploaded to be screened
against that specific post). Their documents are matched from the master
ZIP using the candidate master Excel as the source of truth for which
file is which document type (see services/candidate_ingestion.py).

Note: ingestion_status and status are kept as two separate fields on
purpose -- ingestion_status tracks whether we could even find/match this
candidate's documents (a data problem), while status tracks the actual
screening outcome (a decision about the candidate). This separation
matters because a candidate with missing documents should be visibly
"skipped", not silently counted as a failed evaluation.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    job_profile_id: Mapped[str] = mapped_column(ForeignKey("job_profiles.id"))

    # The Excel "Id." column, e.g. "IHM/JA/1900/10001" -- this is how we
    # match a candidate's Excel row to their nested ZIP file.
    external_id: Mapped[str] = mapped_column(String(100), index=True)

    name: Mapped[str] = mapped_column(String(300), nullable=True)
    email: Mapped[str] = mapped_column(String(300), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    # Stored as string rather than a Date column -- source data formats can
    # be inconsistent, and we don't want ingestion to fail on a bad date.
    # Proper date parsing happens later, at screening time, when needed.
    dob: Mapped[str] = mapped_column(String(20), nullable=True)
    gender: Mapped[str] = mapped_column(String(20), nullable=True)

    raw_category: Mapped[str] = mapped_column(String(100), nullable=True)
    normalized_category: Mapped[str] = mapped_column(String(50), nullable=True)

    # Full Excel row, kept as-is for future reference (education history,
    # work experience, references, etc. -- fields we don't have dedicated
    # columns for yet).
    raw_excel_data: Mapped[dict] = mapped_column(JSON, nullable=True)

    # Tracks what happened during document matching, so downstream screening
    # can skip evaluation (instead of wasting an LLM call) for candidates
    # whose documents are missing/incomplete.
    #   documents_complete    -> every expected document was found
    #   documents_incomplete  -> some documents matched, some missing
    #   no_documents_found    -> ZIP extracted but nothing matched at all
    #   corrupt_zip           -> nested ZIP for this candidate couldn't be read
    #   excel_row_not_found   -> a candidate ZIP existed but no matching Excel row
    ingestion_status: Mapped[str] = mapped_column(String(30), default="pending")

    # Screening outcome as computed by the automated evaluation (age rule +
    # Gemini). This is preserved even if HR later overrides the status, so
    # the original AI/rule-based assessment is never lost.
    computed_status: Mapped[str] = mapped_column(String(30), nullable=True)

    # The EFFECTIVE status -- what everyone (Results, Dashboard, etc.) sees.
    # Starts equal to computed_status once evaluated, but HR can override it
    # via the Manual Review screen (see status_overridden fields below).
    status: Mapped[str] = mapped_column(String(30), default="not_evaluated")

    # HR override tracking -- lets Manual Review show "AI said X, HR
    # changed it to Y, here's why" instead of silently losing that history.
    status_overridden: Mapped[bool] = mapped_column(Boolean, default=False)
    override_reason: Mapped[str] = mapped_column(String(1000), nullable=True)
    overridden_by: Mapped[str] = mapped_column(ForeignKey("hr_users.id"), nullable=True)
    overridden_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    job_profile = relationship("JobProfile")
    documents: Mapped[list["CandidateDocument"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )


class CandidateDocument(Base):
    __tablename__ = "candidate_documents"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id"))

    # photograph / signature / 10th_marksheet / graduation_certificate /
    # salary_slip / resume_cv / pwbd_certificate / category_certificate /
    # experience_proof_1..8
    document_type: Mapped[str] = mapped_column(String(50))

    file_path: Mapped[str] = mapped_column(String(1000))
    original_filename: Mapped[str] = mapped_column(String(500))

    # Page-marked text extracted from the document (the exact blob sent to
    # Gemini during screening), cached at ingestion time so screening never
    # re-parses PDFs. "" for non-PDF/unreadable documents; NULL means "not
    # extracted yet" (rows from before this column existed -- backfilled
    # lazily on first screening).
    extracted_text: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    candidate: Mapped["Candidate"] = relationship(back_populates="documents")
