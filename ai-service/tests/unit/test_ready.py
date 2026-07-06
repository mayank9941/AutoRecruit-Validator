"""
Unit tests for the /ready endpoint.

Verifies that the readiness check correctly reports LLM connectivity status
by mocking get_provider() — no real Gemini API calls are made.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.main import app


@pytest.fixture(autouse=True)
def _clear_ready_cache():
    """Reset the in-memory readiness cache before each test."""
    main_module._ready_cache_result = None
    main_module._ready_cache_timestamp = 0.0
    yield
    main_module._ready_cache_result = None
    main_module._ready_cache_timestamp = 0.0


class _FakeProvider:
    """Minimal LLMProvider stand-in for testing."""

    def __init__(self, healthy: bool):
        self._healthy = healthy

    async def health_check(self) -> bool:
        return self._healthy


@pytest.mark.anyio
async def test_ready_returns_200_when_provider_healthy():
    """When get_provider() returns a provider whose health_check() is True → 200."""
    with patch("app.main.get_provider", return_value=_FakeProvider(healthy=True)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert "llm_provider" in body


@pytest.mark.anyio
async def test_ready_returns_503_when_provider_unhealthy():
    """When get_provider() returns a provider whose health_check() is False → 503."""
    with patch("app.main.get_provider", return_value=_FakeProvider(healthy=False)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["reason"] == "llm_unreachable"


@pytest.mark.anyio
async def test_ready_returns_503_when_provider_misconfigured():
    """When get_provider() raises ValueError (missing API key) → 503."""
    with patch("app.main.get_provider", side_effect=ValueError("GOOGLE_API_KEY is required")):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["reason"] == "llm_provider_misconfigured"
    assert "GOOGLE_API_KEY" in body["detail"]


@pytest.mark.anyio
async def test_ready_cache_returns_cached_result():
    """Second call within TTL returns the cached result without calling health_check again."""
    fake = _FakeProvider(healthy=True)
    fake.health_check = AsyncMock(return_value=True)

    with patch("app.main.get_provider", return_value=fake):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp1 = await client.get("/ready")
            resp2 = await client.get("/ready")

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # health_check should have been called only once — the second hit used the cache
    fake.health_check.assert_awaited_once()


@pytest.mark.anyio
async def test_health_endpoint_unchanged():
    """/health must remain a static config echo — unaffected by this change."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
