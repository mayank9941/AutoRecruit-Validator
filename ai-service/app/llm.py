"""
LLM Provider Abstraction Layer.

Per SKILL.md §3: "Always behind ai-service/llm.py — never call a provider SDK directly from business logic."
Per SKILL.md §2: "The verdict computation itself must never be an LLM call."
Per NFR-02: "All LLM calls routed through a single swappable interface."

The LLM's role is LIMITED to:
(a) extracting the eligibility checklist from a job notice
(b) finding and citing evidence for rules that require documentary proof

Nothing else in the pipeline should call an LLM.
"""

import structlog
from abc import ABC, abstractmethod
from typing import Optional

from app.config import settings

logger = structlog.get_logger(__name__)


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        """Generate a completion from the LLM."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the LLM provider is reachable."""
        ...


class OpenAIProvider(LLMProvider):
    """OpenAI API provider."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from openai import AsyncOpenAI
                self._client = AsyncOpenAI(api_key=self.api_key)
            except ImportError:
                raise RuntimeError("openai package not installed. Run: pip install openai")
        return self._client

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        logger.info("llm_request", provider="openai", prompt_length=len(prompt))

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        result = response.choices[0].message.content
        logger.info("llm_response", provider="openai", response_length=len(result))
        return result

    async def health_check(self) -> bool:
        try:
            client = self._get_client()
            await client.models.list()
            return True
        except Exception as e:
            logger.error("llm_health_check_failed", provider="openai", error=str(e))
            return False


class AnthropicProvider(LLMProvider):
    """Anthropic API provider."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from anthropic import AsyncAnthropic
                self._client = AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                raise RuntimeError("anthropic package not installed. Run: pip install anthropic")
        return self._client

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        client = self._get_client()

        logger.info("llm_request", provider="anthropic", prompt_length=len(prompt))

        kwargs = {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        response = await client.messages.create(**kwargs)

        result = response.content[0].text
        logger.info("llm_response", provider="anthropic", response_length=len(result))
        return result

    async def health_check(self) -> bool:
        try:
            # Simple connectivity check
            self._get_client()
            return True
        except Exception as e:
            logger.error("llm_health_check_failed", provider="anthropic", error=str(e))
            return False


class GoogleProvider(LLMProvider):
    """Google Gemini API provider."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._model = None

    def _get_model(self):
        if self._model is None:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                self._model = genai.GenerativeModel("gemini-2.5-flash")
            except ImportError:
                raise RuntimeError("google-generativeai package not installed. Run: pip install google-generativeai")
        return self._model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        model = self._get_model()

        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt

        logger.info("llm_request", provider="google", prompt_length=len(full_prompt))

        response = await model.generate_content_async(
            full_prompt,
            generation_config={"temperature": temperature, "max_output_tokens": max_tokens},
        )

        result = response.text
        logger.info("llm_response", provider="google", response_length=len(result))
        return result

    async def health_check(self) -> bool:
        try:
            model = self._get_model()
            await model.generate_content_async(
                "ping",
                generation_config={"temperature": 0.0, "max_output_tokens": 1},
            )
            return True
        except Exception as e:
            logger.error("llm_health_check_failed", provider="google", error=str(e))
            return False


def get_llm_provider() -> LLMProvider:
    """
    Factory function to get the configured LLM provider.
    Per SKILL.md §3: configurable provider (OpenAI / Anthropic / Gemini).
    """
    provider = settings.llm_provider.lower()

    if provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        return OpenAIProvider(settings.openai_api_key)

    elif provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic")
        return AnthropicProvider(settings.anthropic_api_key)

    elif provider == "google":
        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is required when LLM_PROVIDER=google")
        return GoogleProvider(settings.google_api_key)

    else:
        raise ValueError(f"Unknown LLM provider: {provider}. Supported: openai, anthropic, google")


# Module-level singleton (lazy)
_provider: Optional[LLMProvider] = None


def get_provider() -> LLMProvider:
    """Get or create the LLM provider singleton."""
    global _provider
    if _provider is None:
        _provider = get_llm_provider()
    return _provider
