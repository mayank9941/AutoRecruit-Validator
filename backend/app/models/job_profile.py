"""
Models: JDUpload -> JobProfile (one-to-many) -> Criterion, AgeRelaxationRule

One JD upload can produce one or more Job Profiles (in the case of a
multi-post JD). Each Job Profile has its own independent criteria and age
relaxation rules, so HR can edit each profile separately (Criteria Editor
requirement).
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class JDUpload(Base):
    __tablename__ = "jd_uploads"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    filename: Mapped[str] = mapped_column(String(500))
    storage_path: Mapped[str] = mapped_column(String(1000))

    # SHA-256 hash of the file's raw bytes -- used to detect whether the
    # exact same file (regardless of filename) has already been uploaded.
    # unique=True so the guarantee also holds at the database level, not
    # just in application logic.
    file_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=True, index=True)

    raw_extracted_text: Mapped[str] = mapped_column(Text, nullable=True)
    # Store Gemini's full raw response here -- useful for debugging and
    # auditing if parsing ever looks wrong later.
    gemini_raw_response: Mapped[dict] = mapped_column(JSON, nullable=True)

    parse_confidence: Mapped[str] = mapped_column(String(20), nullable=True)
    ambiguity_notes: Mapped[str] = mapped_column(Text, nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    job_profiles: Mapped[list["JobProfile"]] = relationship(
        back_populates="source_jd_upload", cascade="all, delete-orphan"
    )


class JobProfile(Base):
    __tablename__ = "job_profiles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    source_jd_upload_id: Mapped[str] = mapped_column(ForeignKey("jd_uploads.id"))

    title: Mapped[str] = mapped_column(String(300))
    method_of_recruitment: Mapped[str] = mapped_column(String(200), nullable=True)
    pay_scale: Mapped[str] = mapped_column(String(200), nullable=True)

    # Base age limit -- parsed (best-effort) from the JD if it stated a
    # clear numeric range. If parsing fails, both stay None -- the raw
    # criterion text will still be shown during screening.
    base_age_min: Mapped[int] = mapped_column(Integer, nullable=True)
    base_age_max: Mapped[int] = mapped_column(Integer, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    source_jd_upload: Mapped["JDUpload"] = relationship(back_populates="job_profiles")
    criteria: Mapped[list["Criterion"]] = relationship(
        back_populates="job_profile", cascade="all, delete-orphan",
        order_by="Criterion.display_order",
    )
    age_relaxation_rules: Mapped[list["AgeRelaxationRule"]] = relationship(
        back_populates="job_profile", cascade="all, delete-orphan"
    )


class Criterion(Base):
    __tablename__ = "criteria"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    job_profile_id: Mapped[str] = mapped_column(ForeignKey("job_profiles.id"))

    type: Mapped[str] = mapped_column(String(50))  # education / experience / skill / age / other
    description: Mapped[str] = mapped_column(Text)
    is_essential: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    job_profile: Mapped["JobProfile"] = relationship(back_populates="criteria")


class AgeRelaxationRule(Base):
    __tablename__ = "age_relaxation_rules"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    job_profile_id: Mapped[str] = mapped_column(ForeignKey("job_profiles.id"))

    raw_category: Mapped[str] = mapped_column(String(500))       # exactly as returned by Gemini
    normalized_category: Mapped[str] = mapped_column(String(100))  # SC/ST/OBC/PwD_General/etc.
    relaxation_text: Mapped[str] = mapped_column(String(200))    # "5 years", "service period + 3 years"

    job_profile: Mapped["JobProfile"] = relationship(back_populates="age_relaxation_rules")
