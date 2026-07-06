"""
Pydantic models for the verdict engine.

Per SKILL.md §2: verdict is one of exactly three values.
Per SKILL.md §6: ai_match_results.rule_results is a JSONB array.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class VerdictEnum(str, Enum):
    """
    The three possible verdicts for a candidate.

    Per SKILL.md §2:
    - eligible: every hard rule passed, every citation verified
    - semi_eligible: every hard rule passed, but ≥1 citation is unverified
    - not_eligible: at least one hard rule failed

    There is NO weighted score, ranking, or percentage.
    """

    ELIGIBLE = "eligible"
    SEMI_ELIGIBLE = "semi_eligible"
    NOT_ELIGIBLE = "not_eligible"


class RuleStatus(str, Enum):
    """Status of a single rule check."""

    PASSED = "passed"
    FAILED = "failed"
    UNVERIFIED = "unverified"
    MISSING_DOCUMENT = "missing_document"
    ERROR = "error"


class RuleResult(BaseModel):
    """
    Result of checking a single eligibility rule.

    Per SKILL.md §6: { rule, value_found, status, document_id, page, quoted_text, citation_verified }
    """

    rule: str = Field(description="The rule being checked")
    rule_type: str = Field(description="'hard' or 'soft' classification")
    value_found: Optional[str] = Field(default=None, description="The value found in the candidate's data")
    status: RuleStatus = Field(description="Pass/fail/unverified status")
    document_id: Optional[str] = Field(default=None, description="ID of the evidence document")
    page: Optional[int] = Field(default=None, description="Page number in the evidence document")
    quoted_text: Optional[str] = Field(default=None, description="The quoted text from the document")
    citation_verified: Optional[bool] = Field(
        default=None,
        description="Whether the citation passed the three-stage verification",
    )
    verification_details: Optional[dict] = Field(
        default=None,
        description="Details of the citation verification stages",
    )


class VerdictRequest(BaseModel):
    """Request to compute a verdict from rule results."""

    rule_results: list[RuleResult] = Field(description="Array of rule check results")


class VerdictResponse(BaseModel):
    """Response containing the computed verdict."""

    verdict: VerdictEnum = Field(description="The computed verdict")
    rule_results: list[RuleResult] = Field(description="The rule results used to compute the verdict")
    summary: dict = Field(description="Summary counts of passed/failed/unverified rules")
