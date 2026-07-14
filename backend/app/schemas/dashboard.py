"""
Pydantic schemas for the Dashboard endpoint.
"""

from typing import Optional, Dict
from datetime import datetime
from pydantic import BaseModel


class RecentJDUpload(BaseModel):
    id: str
    filename: str
    uploaded_at: datetime
    post_count: int


class RecentScreeningRun(BaseModel):
    id: str
    job_profile_id: str
    job_profile_title: str
    status: str
    total_candidates: int
    processed_count: int
    failed_count: int
    started_at: datetime
    completed_at: Optional[datetime] = None


class DashboardSummary(BaseModel):
    total_job_profiles: int
    total_candidates: int
    candidates_by_status: Dict[str, int]
    recent_jd_uploads: list[RecentJDUpload]
    recent_screening_runs: list[RecentScreeningRun]
