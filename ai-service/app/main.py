"""
AI Recruitment Platform — AI Service (FastAPI).

This service handles:
- Checklist extraction from job notice PDFs (LLM-powered)
- Structured form PDF parsing (deterministic, no LLM)
- Rule checking against declared values + evidence citations
- Citation verification (deterministic, three-stage)
- Verdict computation (pure function, no AI)

Per SKILL.md §3: Python + FastAPI, separate service — backend calls it over HTTP.
Per SKILL.md §11: Thin FastAPI handlers — Pydantic validation, logic in separate functions.
"""

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
import uuid

from app.config import settings
from app.llm import get_provider
from app.logging_config import configure_logging

# In-memory cache for /ready health checks (avoids hitting Gemini on every poll)
_READY_CACHE_TTL_SECONDS = 30
_ready_cache_result: bool | None = None
_ready_cache_timestamp: float = 0.0


# Configure structured logging before anything else
configure_logging(settings.log_level)

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown handlers."""
    logger.info(
        "ai_service_starting",
        environment=settings.environment,
        llm_provider=settings.llm_provider,
        fuzzy_threshold=settings.fuzzy_match_threshold,
    )
    yield
    logger.info("ai_service_shutting_down")


app = FastAPI(
    title="AI Recruitment Platform — AI Service",
    description="Eligibility checking, citation verification, and verdict computation",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.backend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request ID middleware — propagate correlation ID from backend
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    start_time = time.time()
    response: Response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    response.headers["X-Request-ID"] = request_id

    # Don't log health checks to reduce noise
    if request.url.path not in ("/health", "/ready"):
        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )

    return response


# Global exception handler — never expose stack traces
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "unhandled_exception",
        method=request.method,
        path=request.url.path,
        error=str(exc),
        error_type=type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
            }
        },
    )


# ============================================================================
# Health & Root Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint to prevent 404s on base URL."""
    return {
        "service": "recruitment-ai-service",
        "status": "running",
        "docs_url": "/docs",
        "health_url": "/health"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint.

    Used by AWS ALB, ECS, Docker HEALTHCHECK, and CI smoke tests.
    """
    return {
        "status": "healthy",
        "service": "recruitment-ai-service",
        "version": "1.0.0",
        "environment": settings.environment,
        "llm_provider": settings.llm_provider,
    }


@app.get("/ready")
async def readiness_check():
    """
    Readiness check — confirms the service can reach the configured LLM provider.

    Uses a short TTL cache to avoid hitting the Gemini API on every ALB/Docker poll.
    """
    global _ready_cache_result, _ready_cache_timestamp

    now = time.time()
    if _ready_cache_result is not None and (now - _ready_cache_timestamp) < _READY_CACHE_TTL_SECONDS:
        if _ready_cache_result:
            return {"status": "ready", "llm_provider": settings.llm_provider}
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "llm_unreachable", "llm_provider": settings.llm_provider},
        )

    try:
        provider = get_provider()
    except ValueError as exc:
        _ready_cache_result = False
        _ready_cache_timestamp = now
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "llm_provider_misconfigured", "detail": str(exc)},
        )

    healthy = await provider.health_check()
    _ready_cache_result = healthy
    _ready_cache_timestamp = now

    if not healthy:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "llm_unreachable", "llm_provider": settings.llm_provider},
        )

    return {"status": "ready", "llm_provider": settings.llm_provider}


# ============================================================================
# API Route Registration (added as phases progress)
# ============================================================================

# Phase 2: Checklist extraction routes
from app.routes.checklist import router as checklist_router
app.include_router(checklist_router, prefix="/api", tags=["Checklist"])

# Phase 4: Form parsing routes
from app.routes.form_parser import router as form_parser_router
app.include_router(form_parser_router, prefix="/api", tags=["Form Parser"])

# Phase 5: Rule checking routes
from app.routes.rule_checker import router as rule_checker_router
app.include_router(rule_checker_router, prefix="/api", tags=["Rule Checker"])

# Phase 6: Verdict routes
from app.routes.verdict import router as verdict_router
app.include_router(verdict_router, prefix="/api", tags=["Verdict"])
