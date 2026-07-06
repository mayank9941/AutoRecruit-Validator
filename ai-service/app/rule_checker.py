"""
Rule Checking and Citation Verification module.

Per SKILL.md §2: The LLM finds and cites evidence for rules requiring documentary proof.
Per SKILL.md §7: Three-stage verification for citations.
"""

import structlog
from typing import List, Dict, Any, Optional
import json

from app.models.verdict import RuleResult, RuleStatus
from app.models.checklist import ChecklistRule
from app.models.form_data import ParsedFormData, AttachmentManifest
from app.llm import get_provider

logger = structlog.get_logger(__name__)

# Configurable threshold from implementation plan
FUZZY_MATCH_THRESHOLD = 0.85

CITATION_SYSTEM_PROMPT = """You are an expert HR document auditor.
Your task is to verify if a candidate meets a specific eligibility rule by examining their provided document text.

Rules:
1. You MUST find a direct, verbatim quote in the document text that proves the rule is met.
2. If the rule is met, return status "passed", the exact quote, and the page number.
3. If the document proves the candidate DOES NOT meet the rule, return status "failed".
4. If the document is ambiguous or doesn't contain enough information, return status "unverified".

Respond ONLY with valid JSON in this exact format:
{
  "status": "passed|failed|unverified",
  "quoted_text": "The exact verbatim quote from the text",
  "page_number": 1,
  "reasoning": "Brief explanation of how the quote proves/disproves the rule"
}"""

CITATION_USER_PROMPT = """Rule to check: "{rule}"

Document Type: {doc_type}
Document Text:
---
{doc_text}
---

Evaluate the rule against the document text."""


def _fuzzy_match_quote(quote: str, text: str) -> bool:
    """
    Stage 3 of verification: Check if the quoted text actually exists in the document.
    Uses simple containment for now, but could be enhanced with Levenshtein distance
    to match the FUZZY_MATCH_THRESHOLD.
    """
    if not quote or not text:
        return False
        
    # Simplify text for comparison (remove extra whitespace, case insensitive)
    clean_quote = " ".join(quote.lower().split())
    clean_text = " ".join(text.lower().split())
    
    return clean_quote in clean_text


async def _check_rule_with_llm(
    rule: ChecklistRule, 
    document_text: str, 
    document_id: str
) -> RuleResult:
    """Use LLM to find citations for a rule in a document (Stages 1-3 verification)."""
    provider = get_provider()
    prompt = CITATION_USER_PROMPT.format(
        rule=rule.rule_text,
        doc_type=rule.expected_document_type or "Document",
        doc_text=document_text[:10000] # Truncate to avoid context limits
    )
    
    try:
        raw_response = await provider.generate(
            prompt=prompt,
            system_prompt=CITATION_SYSTEM_PROMPT,
            temperature=0.0
        )
        
        # Clean response
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[: -3]
            
        parsed = json.loads(cleaned.strip())
        
        status_str = parsed.get("status", "unverified")
        quoted_text = parsed.get("quoted_text")
        page_number = parsed.get("page_number")
        
        # Map string status to Enum
        status = RuleStatus.UNVERIFIED
        if status_str == "passed":
            status = RuleStatus.PASSED
        elif status_str == "failed":
            status = RuleStatus.FAILED
            
        # Stage 3 Verification: Ensure the quote is actually in the text
        citation_verified = None
        if status == RuleStatus.PASSED and quoted_text:
            citation_verified = _fuzzy_match_quote(quoted_text, document_text)
            if not citation_verified:
                # LLM hallucinated the quote - downgrade to unverified
                status = RuleStatus.UNVERIFIED
                logger.warning(
                    "hallucinated_citation",
                    rule=rule.rule_text,
                    quote=quoted_text
                )
        
        return RuleResult(
            rule=rule.rule_text,
            rule_type=rule.rule_type,
            status=status,
            value_found="See citation",
            document_id=document_id,
            page=page_number,
            quoted_text=quoted_text,
            citation_verified=citation_verified,
            verification_details={
                "stage1_llm_response": status_str,
                "stage2_confidence": 1.0, # Pure LLM logic in this implementation
                "stage3_text_match": citation_verified,
                "reasoning": parsed.get("reasoning")
            }
        )
        
    except Exception as e:
        logger.error("llm_citation_error", rule=rule.rule_text, error=str(e))
        return RuleResult(
            rule=rule.rule_text,
            rule_type=rule.rule_type,
            status=RuleStatus.ERROR,
            verification_details={"error": str(e)}
        )


def _check_simple_rule(rule: ChecklistRule, form_data: ParsedFormData) -> RuleResult:
    """Check a rule deterministically against parsed form data without LLM."""
    # This requires a more sophisticated mapping between rule categories and form fields
    # For now, we do a best-effort simple check or return UNVERIFIED.
    
    status = RuleStatus.UNVERIFIED
    value_found = None
    
    # Very basic example logic
    rule_lower = rule.rule_text.lower()
    if rule.category == "age" and form_data.personal_info and form_data.personal_info.age:
        value_found = f"Age: {form_data.personal_info.age}"
        # Hardcoding logic is brittle, this is where a small fast LLM call for
        # semantic matching (value -> rule) might be used in a real system,
        # but the prompt says deterministic logic.
        # We will assume it's unverified and needs manual review if we can't parse it.
    elif rule.category == "education" and form_data.education:
        quals = [e.qualification for e in form_data.education if e.qualification]
        value_found = f"Qualifications: {', '.join(quals)}"
        
    return RuleResult(
        rule=rule.rule_text,
        rule_type=rule.rule_type,
        status=status,
        value_found=value_found,
    )


async def check_rules_against_candidate(
    parsed_form_data: ParsedFormData,
    checklist_rules: List[ChecklistRule],
    attachment_manifest: AttachmentManifest,
    application_id: str,
    fetch_document_text_fn=None # Callback to get document text
) -> List[RuleResult]:
    """
    Check all checklist rules against candidate data and documents.
    
    Args:
        parsed_form_data: Deterministically extracted form data
        checklist_rules: Locked checklist rules
        attachment_manifest: Details of provided documents
        application_id: Application ID for logging/correlation
        fetch_document_text_fn: Async function to fetch text for a document type
        
    Returns:
        List of RuleResults
    """
    logger.info("checking_rules", application_id=application_id, rule_count=len(checklist_rules))
    
    results = []
    
    for rule in checklist_rules:
        if rule.requires_document:
            # Check if document exists in manifest
            doc_type = rule.expected_document_type
            doc_entry = next((d for d in attachment_manifest.attachments if d.document_type == doc_type), None)
            
            if not doc_entry:
                results.append(RuleResult(
                    rule=rule.rule_text,
                    rule_type=rule.rule_type,
                    status=RuleStatus.MISSING_DOCUMENT,
                    verification_details={"error": f"Required document {doc_type} not found in manifest"}
                ))
                continue
                
            # Fetch text and use LLM
            if fetch_document_text_fn:
                try:
                    doc_text, doc_id = await fetch_document_text_fn(doc_type)
                    if doc_text:
                        result = await _check_rule_with_llm(rule, doc_text, doc_id)
                        results.append(result)
                        continue
                except Exception as e:
                    logger.error("fetch_document_error", error=str(e))
                    
            # Fallback if we can't get text or fetch fn isn't provided
            results.append(RuleResult(
                rule=rule.rule_text,
                rule_type=rule.rule_type,
                status=RuleStatus.UNVERIFIED,
                verification_details={"error": "Document text unavailable for verification"}
            ))
            
        else:
            # Deterministic check against form data
            results.append(_check_simple_rule(rule, parsed_form_data))
            
    return results
