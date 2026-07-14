"""
Pydantic schemas for the Manual Review endpoints -- the full
criterion-by-criterion breakdown for a candidate, plus HR's ability to
override the final status.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator

ALLOWED_OVERRIDE_STATUSES = {"eligible", "not_eligible", "needs_review"}


class CriterionEvaluationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    criterion_id: str
    criterion_type: str
    criterion_description: str
    is_essential: bool
    result: str
    citation_document: Optional[str] = None
    citation_page: Optional[int] = None
    reasoning: Optional[str] = None


class CandidateReviewDetail(BaseModel):
    candidate_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    ingestion_status: str
    computed_status: Optional[str] = None
    status: str
    status_overridden: bool
    override_reason: Optional[str] = None
    overridden_by: Optional[str] = None
    overridden_at: Optional[datetime] = None
    evaluations: List[CriterionEvaluationDetail] = []


class OverrideRequest(BaseModel):
    new_status: str
    reason: Optional[str] = None

    @field_validator("new_status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ALLOWED_OVERRIDE_STATUSES:
            raise ValueError(
                f"new_status must be one of {sorted(ALLOWED_OVERRIDE_STATUSES)}, got '{v}'"
            )
        return v


class OverrideResponse(BaseModel):
    candidate_id: str
    status: str
    status_overridden: bool
    override_reason: Optional[str] = None
    overridden_by: Optional[str] = None
    overridden_at: Optional[datetime] = None
