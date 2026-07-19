"""
Pydantic schemas -- these define the shape of the API responses.
Kept separate from the SQLAlchemy models so the DB structure and the API
contract can evolve independently.
"""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class CriterionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    description: str
    is_essential: bool
    display_order: int


class AgeRelaxationRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    raw_category: str
    normalized_category: str
    relaxation_text: str


class JobProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    method_of_recruitment: Optional[str] = None
    pay_scale: Optional[str] = None
    base_age_min: Optional[int] = None
    base_age_max: Optional[int] = None
    criteria: List[CriterionOut] = []
    age_relaxation_rules: List[AgeRelaxationRuleOut] = []


class JDUploadResponse(BaseModel):
    jd_upload_id: str
    filename: str
    parse_confidence: str
    ambiguity_notes: str
    post_count: int
    validation_warnings: List[str] = []
    is_duplicate: bool = False
    duplicate_message: Optional[str] = None
    job_profiles: List[JobProfileOut]


# ---- Criteria Editor request schemas ----

class CriterionCreate(BaseModel):
    type: str  # education / experience / skill / age / other
    description: str
    is_essential: bool = True
    display_order: Optional[int] = None  # None -> appended to the end of the list


class CriterionUpdate(BaseModel):
    """All fields are optional -- only the fields you send get updated (partial update)."""
    type: Optional[str] = None
    description: Optional[str] = None
    is_essential: Optional[bool] = None
    display_order: Optional[int] = None


class CriteriaRestoreResponse(BaseModel):
    restored_count: int
    profile: JobProfileOut
