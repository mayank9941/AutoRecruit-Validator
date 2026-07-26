"""
Pydantic schemas for candidate upload and listing endpoints.
"""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class CandidateDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_type: str
    original_filename: str


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    external_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    raw_category: Optional[str] = None
    normalized_category: Optional[str] = None
    ingestion_status: str
    computed_status: Optional[str] = None
    status: str
    status_overridden: bool = False
    documents: List[CandidateDocumentOut] = []


class CandidateUploadSummary(BaseModel):
    job_profile_id: str
    total_candidates_found: int
    # How many of those replaced an existing candidate (matched by the
    # Excel "Id." column) instead of being newly created.
    replaced_candidates: int = 0
    documents_complete: int
    documents_incomplete: int
    no_documents_found: int
    excel_row_not_found: int
    corrupt_zip: int
    candidates: List[CandidateOut]
