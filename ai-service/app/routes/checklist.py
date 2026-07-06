import structlog
from fastapi import APIRouter
from app.models.checklist import ChecklistExtractionRequest, ChecklistExtractionResponse
from app.checklist_extractor import extract_checklist_from_notice

logger = structlog.get_logger(__name__)
router = APIRouter()

@router.post("/extract-checklist", response_model=ChecklistExtractionResponse)
async def extract_checklist_route(request: ChecklistExtractionRequest):
    """
    Extract a checklist from a job notice.
    
    Per SKILL.md §2: LLM's role is limited to extracting the eligibility checklist.
    """
    return await extract_checklist_from_notice(request.job_notice_text, request.job_id)
