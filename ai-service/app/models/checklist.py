"""
Pydantic models for checklist extraction.

Per SKILL.md §2: checklist rules are classified as hard/soft by the recruiter.
Per PRD v3 FR-03: checklists are versioned, not mutated after lock.
"""

from typing import Optional
from pydantic import BaseModel, Field


class ChecklistRule(BaseModel):
    """A single eligibility rule in a job checklist."""

    id: Optional[str] = Field(default=None, description="Rule ID (assigned after persistence)")
    rule_text: str = Field(description="The eligibility requirement text")
    rule_type: str = Field(
        default="hard",
        description="'hard' or 'soft' — hard rules cause not_eligible if failed",
    )
    category: Optional[str] = Field(
        default=None,
        description="Category grouping (education, experience, age, etc.)",
    )
    requires_document: bool = Field(
        default=False,
        description="Whether this rule requires documentary evidence",
    )
    expected_document_type: Optional[str] = Field(
        default=None,
        description="The type of document expected as evidence (e.g., 'degree_certificate')",
    )


class ChecklistExtractionRequest(BaseModel):
    """Request to extract a checklist from a job notice."""

    job_notice_text: str = Field(description="The full text of the job notice")
    job_id: str = Field(description="The job ID for context")


class ChecklistExtractionResponse(BaseModel):
    """Response containing the extracted checklist rules."""

    rules: list[ChecklistRule] = Field(description="Extracted eligibility rules")
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Overall confidence in the extraction",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Any warnings about uncertain extractions",
    )
