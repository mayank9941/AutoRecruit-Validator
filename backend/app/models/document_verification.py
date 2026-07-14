"""
DocumentVerification model.

For candidates who passed screening ("eligible"), this tracks a re-check
of their identity details against a reliable source document -- the 10th
standard marksheet/certificate, which IHMCL's own advertisements
explicitly treat as the authoritative document for DOB verification (seen
directly in one of the parsed JDs: "10th Certificate/ marksheet is
mandatory for Date of Birth (DOB) Verification").

One row per field checked (e.g. one for "name", one for "date_of_birth")
per candidate.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class DocumentVerification(Base):
    __tablename__ = "document_verifications"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id"))

    field_name: Mapped[str] = mapped_column(String(50))  # "name" / "date_of_birth"
    source_document_type: Mapped[str] = mapped_column(String(50))  # e.g. "10th_marksheet"

    form_value: Mapped[str] = mapped_column(String(500), nullable=True)
    extracted_value: Mapped[str] = mapped_column(String(500), nullable=True)
    extraction_confidence: Mapped[str] = mapped_column(String(20), nullable=True)  # high / medium / low

    # matched / mismatch / low_confidence / extraction_failed
    match_status: Mapped[str] = mapped_column(String(30))

    # HR's manual decision -- null until HR reviews it
    hr_decision: Mapped[str] = mapped_column(String(20), nullable=True)  # verified / rejected
    hr_notes: Mapped[str] = mapped_column(String(1000), nullable=True)
    verified_by: Mapped[str] = mapped_column(ForeignKey("hr_users.id"), nullable=True)
    verified_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    candidate = relationship("Candidate")
