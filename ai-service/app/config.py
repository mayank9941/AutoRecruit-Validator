"""
AI Recruitment Platform — AI Service Configuration.

Uses Pydantic Settings for environment variable validation.
"""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # General
    environment: str = Field(default="development", description="Runtime environment")
    log_level: str = Field(default="info", description="Logging level")
    host: str = Field(default="0.0.0.0", description="Server bind host")
    port: int = Field(default=8000, description="Server bind port")

    # LLM Provider
    llm_provider: str = Field(default="openai", description="LLM provider: openai, anthropic, google")
    openai_api_key: str = Field(default="", description="OpenAI API key")
    anthropic_api_key: str = Field(default="", description="Anthropic API key")
    google_api_key: str = Field(default="", description="Google API key")

    # Backend communication
    backend_url: str = Field(default="http://localhost:3001", description="Backend service URL")

    # AWS S3
    aws_region: str = Field(default="ap-south-1", description="AWS region")
    aws_access_key_id: str = Field(default="", description="AWS access key")
    aws_secret_access_key: str = Field(default="", description="AWS secret key")
    s3_bucket_name: str = Field(default="recruitment-platform-documents", description="S3 bucket for documents")

    # Citation Verification
    # WHY 0.85: See SKILL.md §8 — this is a tuning decision. A threshold of 0.85
    # balances between catching minor OCR/formatting differences and rejecting
    # genuinely wrong citations. This is a named constant, not a magic number.
    fuzzy_match_threshold: float = Field(
        default=0.85,
        ge=0.0,
        le=1.0,
        description="Fuzzy-match similarity threshold for citation text verification",
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
