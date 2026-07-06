"""
Structured logging configuration for the AI Service.

Uses structlog per the tech stack decision.
PII redaction is applied to prevent logging candidate names, emails, phone numbers,
or Aadhaar numbers — per SKILL.md §10.
"""

import structlog
import logging

# Fields containing PII that must be redacted
PII_FIELDS = frozenset({
    "email", "phone", "phone_number", "mobile", "mobile_number",
    "aadhaar", "aadhaar_number", "aadhar", "pan", "pan_number",
    "passport", "passport_number", "address", "full_address",
    "date_of_birth", "dob", "bank_account", "ifsc", "ssn",
    "password", "password_hash",
})

# Fields to partially redact (show first/last characters)
PARTIAL_REDACT_FIELDS = frozenset({
    "name", "first_name", "last_name", "candidate_name",
    "father_name", "mother_name",
})


def _redact_value(key: str, value):
    """Redact a single value based on its field name."""
    if value is None:
        return value

    lower_key = key.lower()

    if lower_key in PII_FIELDS:
        return "[REDACTED]"

    if lower_key in PARTIAL_REDACT_FIELDS:
        s = str(value)
        if len(s) <= 2:
            return "[REDACTED]"
        return f"{s[0]}{'*' * (len(s) - 2)}{s[-1]}"

    return value


def pii_redactor(_, __, event_dict: dict) -> dict:
    """Structlog processor that redacts PII fields from log entries."""
    for key in list(event_dict.keys()):
        if isinstance(event_dict[key], dict):
            event_dict[key] = {
                k: _redact_value(k, v) for k, v in event_dict[key].items()
            }
        else:
            event_dict[key] = _redact_value(key, event_dict[key])
    return event_dict


def configure_logging(log_level: str = "info"):
    """Configure structlog with PII redaction and JSON output in production."""

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        pii_redactor,
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer()
            if log_level == "debug"
            else structlog.processors.JSONRenderer(),
        ],
    )

    handler = logging.StreamHandler()
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Quiet noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
