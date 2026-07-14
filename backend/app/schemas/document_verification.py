"""
Pydantic schemas for the Document Verification endpoints.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator

ALLOWED_HR_DECISIONS = {"verified", "rejected"}


class DocumentVerificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    field_name: str
    source_document_type: str
    form_value: Optional[str] = None
    extracted_value: Optional[str] = None
    extraction_confidence: Optional[str] = None
    match_status: str
    hr_decision: Optional[str] = None
    hr_notes: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None


class VerificationDecisionRequest(BaseModel):
    decision: str
    notes: Optional[str] = None

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        if v not in ALLOWED_HR_DECISIONS:
            raise ValueError(
                f"decision must be one of {sorted(ALLOWED_HR_DECISIONS)}, got '{v}'"
            )
        return v


class CandidateVerificationSummary(BaseModel):
    candidate_id: str
    skipped: bool = False
    skip_reason: Optional[str] = None
    verifications: List[DocumentVerificationOut] = []
