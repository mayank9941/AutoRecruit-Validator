"""
ScreeningRun model -- tracks one batch-screening run for a Job Profile, so
the frontend can poll for live progress ("X of Y candidates processed")
and so a run history can be shown later on the Dashboard.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class ScreeningRun(Base):
    __tablename__ = "screening_runs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    job_profile_id: Mapped[str] = mapped_column(ForeignKey("job_profiles.id"))

    total_candidates: Mapped[int] = mapped_column(Integer, default=0)
    processed_count: Mapped[int] = mapped_column(Integer, default=0)
    # Candidates that hit an unexpected error during evaluation (not the
    # same as "documents missing" -- those are skipped cleanly, not counted
    # as failures).
    failed_count: Mapped[int] = mapped_column(Integer, default=0)

    # "running" / "completed"
    status: Mapped[str] = mapped_column(String(20), default="running")

    started_by: Mapped[str] = mapped_column(ForeignKey("hr_users.id"), nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    job_profile = relationship("JobProfile")
