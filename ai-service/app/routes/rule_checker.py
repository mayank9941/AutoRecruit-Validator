import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List
from app.models.verdict import RuleResult
from app.models.checklist import ChecklistRule
from app.models.form_data import ParsedFormData, AttachmentManifest
from app.rule_checker import check_rules_against_candidate

logger = structlog.get_logger(__name__)
router = APIRouter()

class RuleCheckRequest(BaseModel):
    """Request to check rules against candidate data."""
    parsed_form_data: ParsedFormData = Field(description="Parsed application form data")
    checklist_rules: List[ChecklistRule] = Field(description="Locked checklist rules")
    attachment_manifest: AttachmentManifest = Field(description="Parsed attachment manifest")
    application_id: str = Field(description="Application ID for correlation")

class RuleCheckResponse(BaseModel):
    """Response containing rule check results."""
    rule_results: List[RuleResult] = Field(description="Results of rule checks")

@router.post("/check-rules", response_model=RuleCheckResponse)
async def check_rules_route(request: RuleCheckRequest):
    """
    Run rule checking against a candidate's declared values and evidence.
    """
    results = await check_rules_against_candidate(
        request.parsed_form_data,
        request.checklist_rules,
        request.attachment_manifest,
        request.application_id
    )
    
    return RuleCheckResponse(rule_results=results)
