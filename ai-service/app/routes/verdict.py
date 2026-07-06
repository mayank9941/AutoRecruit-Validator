from fastapi import APIRouter
from app.models.verdict import VerdictRequest, VerdictResponse
from app.verdict import compute_verdict

router = APIRouter()

@router.post("/compute-verdict", response_model=VerdictResponse)
async def compute_verdict_route(request: VerdictRequest):
    """
    Compute a verdict from rule results.
    
    Per SKILL.md §2: The verdict computation is a pure, deterministic function.
    """
    return compute_verdict(request.rule_results)
