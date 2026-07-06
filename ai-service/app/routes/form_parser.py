import structlog
from fastapi import APIRouter
from app.models.form_data import FormParseRequest, FormParseResponse
from app.form_parser import parse_application_form

logger = structlog.get_logger(__name__)
router = APIRouter()

@router.post("/parse-form", response_model=FormParseResponse)
async def parse_form_route(request: FormParseRequest):
    """
    Parse a structured application form PDF.
    
    Per SKILL.md §6: deterministic table extraction, not LLM reading.
    """
    parsed_data, manifest, version = await parse_application_form(
        request.pdf_s3_key, 
        request.reference_number
    )
    
    return FormParseResponse(
        parsed_form_data=parsed_data,
        attachment_manifest=manifest,
        template_version=version
    )
