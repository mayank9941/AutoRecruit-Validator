"""
CriterionEvaluation model.

Stores the per-criterion result for a candidate's screening -- one row per
(candidate, criterion) pair. This is what lets HR see a full
criterion-by-criterion breakdown during manual review, with a citation for
each result rather than just the AI's unverified word.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class CriterionEvaluation(Base):
    __tablename__ = "criterion_evaluations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id"))
    criterion_id: Mapped[str] = mapped_column(ForeignKey("criteria.id"))

    # "pass" / "fail" / "needs_review"
    # (Gemini's "uncertain" is normalized to "needs_review" at the service
    # layer, so this column uses one consistent vocabulary regardless of
    # whether the evaluation came from Gemini or the rule-based age check.)
    result: Mapped[str] = mapped_column(String(20))

    # Only set for "skill" criteria: the percentage of the JD's skill list
    # the candidate's documents show evidence of (0-100). Informational for
    # HR -- skills never reject a candidate. NULL for all other types.
    match_percentage: Mapped[int] = mapped_column(Integer, nullable=True)

    citation_document: Mapped[str] = mapped_column(String(500), nullable=True)
    citation_page: Mapped[int] = mapped_column(Integer, nullable=True)
    reasoning: Mapped[str] = mapped_column(Text, nullable=True)

    evaluated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    candidate = relationship("Candidate")
    criterion = relationship("Criterion")
