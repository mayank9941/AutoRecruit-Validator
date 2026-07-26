"""
Pydantic schemas for the screening/evaluation endpoints.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CriterionEvaluationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    criterion_id: str
    result: str
    match_percentage: Optional[int] = None
    citation_document: Optional[str] = None
    citation_page: Optional[int] = None
    reasoning: Optional[str] = None


class CandidateEvaluationResult(BaseModel):
    candidate_id: str
    ingestion_status: str
    status: str
    skipped: bool = False
    skip_reason: Optional[str] = None
    evaluations: List[CriterionEvaluationOut] = []


class ScreeningRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_profile_id: str
    total_candidates: int
    processed_count: int
    failed_count: int
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
