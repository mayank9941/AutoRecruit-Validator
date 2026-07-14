"""
Pydantic schemas for the results/export endpoints.
"""

from typing import List
from pydantic import BaseModel

from app.schemas.candidate import CandidateOut


class ResultsSummary(BaseModel):
    total: int
    eligible: int
    not_eligible: int
    needs_review: int
    not_evaluated: int


class ResultsResponse(BaseModel):
    summary: ResultsSummary
    candidates: List[CandidateOut]
