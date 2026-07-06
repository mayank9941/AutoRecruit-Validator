"""
Checklist Extraction module.
Per SKILL.md §2: LLM's role is limited to extracting the eligibility checklist.
This is one of only TWO places in the codebase where an LLM call is permitted.
"""

import structlog
import json
from typing import Optional
from app.models.checklist import ChecklistExtractionResponse, ChecklistRule
from app.llm import get_provider

logger = structlog.get_logger(__name__)

SYSTEM_PROMPT = """You are an expert HR document analyst specializing in Indian government job notices.
Your task is to extract a structured eligibility checklist from a job notice.

Rules:
1. Extract EVERY eligibility requirement mentioned in the notice.
2. Classify each rule as "hard" (mandatory, disqualifying if failed) or "soft" (preferred, not disqualifying).
3. For each rule, identify the document category that would serve as evidence.
4. Be exhaustive — missing a rule means a candidate might be wrongly evaluated.
5. Do NOT invent requirements that are not in the notice text.

Respond ONLY with valid JSON in this exact format:
{
  "rules": [
    {
      "rule_text": "The exact requirement text, paraphrased for clarity",
      "rule_type": "hard",
      "category": "education|experience|age|nationality|other",
      "requires_document": true,
      "expected_document_type": "degree_certificate|experience_letter|age_proof|caste_certificate|other"
    }
  ],
  "confidence": 0.95,
  "warnings": ["Any ambiguities or notes about the extraction"]
}"""

USER_PROMPT_TEMPLATE = """Extract the eligibility checklist from the following job notice.

Job Notice Text:
---
{notice_text}
---

Return a JSON object with the extracted rules. Be exhaustive and precise."""


async def extract_checklist_from_notice(
    job_notice_text: str, job_id: str
) -> ChecklistExtractionResponse:
    """
    Extract a checklist from a job notice using the configured LLM.

    This function sends the notice text to the LLM with a carefully crafted
    prompt, then parses the structured JSON response into ChecklistRule objects.

    Falls back to a best-effort parse if the LLM returns malformed JSON.
    """
    logger.info(
        "extracting_checklist",
        job_id=job_id,
        text_length=len(job_notice_text),
    )

    provider = get_provider()
    user_prompt = USER_PROMPT_TEMPLATE.format(notice_text=job_notice_text)

    try:
        raw_response = await provider.generate(
            prompt=user_prompt,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.0,
            max_tokens=4096,
        )

        # Strip markdown code fences if present
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            # Remove opening fence (with optional language tag)
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[: -3]
        cleaned = cleaned.strip()

        parsed = json.loads(cleaned)

        rules = []
        for rule_data in parsed.get("rules", []):
            rules.append(
                ChecklistRule(
                    rule_text=rule_data.get("rule_text", ""),
                    rule_type=rule_data.get("rule_type", "hard"),
                    category=rule_data.get("category"),
                    requires_document=rule_data.get("requires_document", False),
                    expected_document_type=rule_data.get("expected_document_type"),
                )
            )

        confidence = parsed.get("confidence", 0.8)
        warnings = parsed.get("warnings", [])

        logger.info(
            "checklist_extracted",
            job_id=job_id,
            rule_count=len(rules),
            confidence=confidence,
        )

        return ChecklistExtractionResponse(
            rules=rules,
            confidence=confidence,
            warnings=warnings,
        )

    except json.JSONDecodeError as e:
        logger.error(
            "checklist_parse_failed",
            job_id=job_id,
            error=str(e),
            raw_response=raw_response[:500] if raw_response else None,
        )
        return ChecklistExtractionResponse(
            rules=[],
            confidence=0.0,
            warnings=[
                f"LLM returned invalid JSON: {str(e)}",
                "Manual checklist entry required.",
            ],
        )

    except Exception as e:
        logger.error(
            "checklist_extraction_failed",
            job_id=job_id,
            error=str(e),
        )
        return ChecklistExtractionResponse(
            rules=[],
            confidence=0.0,
            warnings=[
                f"Extraction failed: {str(e)}",
                "Manual checklist entry required.",
            ],
        )
