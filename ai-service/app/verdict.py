"""
Deterministic Verdict Engine.

Per SKILL.md §2:
  "The verdict computation itself must never be an LLM call.
   It is a pure, deterministic function over rule pass/fail and citation-verified statuses."

Per implementation plan Phase 6:
  - any failed hard rule → not_eligible
  - all hard rules passed, ≥1 unverified citation → semi_eligible
  - all hard rules passed, all citations verified → eligible

This function is small enough to have 100% branch coverage; there's no excuse not to.
"""

import structlog

from app.models.verdict import (
    RuleResult,
    RuleStatus,
    VerdictEnum,
    VerdictRequest,
    VerdictResponse,
)

logger = structlog.get_logger(__name__)


def compute_verdict(rule_results: list[RuleResult]) -> VerdictResponse:
    """
    Pure, deterministic function: rule results → verdict.

    Decision tree:
    1. If ANY hard rule has status FAILED or MISSING_DOCUMENT → NOT_ELIGIBLE
    2. If all hard rules passed but ≥1 has citation_verified=False → SEMI_ELIGIBLE
    3. If all hard rules passed and all citations verified → ELIGIBLE

    Per assumption A4: Missing-document rules count toward not_eligible.

    This function has ZERO side effects. It does not call any LLM, database,
    or external service. It is a pure function over its inputs.
    """
    if not rule_results:
        logger.warning("verdict_empty_rules", message="No rule results provided")
        return VerdictResponse(
            verdict=VerdictEnum.NOT_ELIGIBLE,
            rule_results=rule_results,
            summary={
                "total": 0,
                "hard_passed": 0,
                "hard_failed": 0,
                "soft_passed": 0,
                "soft_failed": 0,
                "unverified_citations": 0,
                "missing_documents": 0,
            },
        )

    # Counters for summary
    hard_passed = 0
    hard_failed = 0
    soft_passed = 0
    soft_failed = 0
    unverified_citations = 0
    missing_documents = 0
    has_failed_hard_rule = False
    has_unverified_citation = False

    for rule in rule_results:
        is_hard = rule.rule_type == "hard"

        if rule.status == RuleStatus.FAILED:
            if is_hard:
                hard_failed += 1
                has_failed_hard_rule = True
            else:
                soft_failed += 1

        elif rule.status == RuleStatus.MISSING_DOCUMENT:
            missing_documents += 1
            # Per assumption A4: missing docs count toward not_eligible
            if is_hard:
                hard_failed += 1
                has_failed_hard_rule = True
            else:
                soft_failed += 1

        elif rule.status == RuleStatus.PASSED:
            if is_hard:
                hard_passed += 1
            else:
                soft_passed += 1

            # Check citation verification status
            if rule.citation_verified is False:
                unverified_citations += 1
                has_unverified_citation = True

        elif rule.status == RuleStatus.UNVERIFIED:
            unverified_citations += 1
            has_unverified_citation = True
            if is_hard:
                hard_passed += 1  # Rule itself passed, citation unverified
            else:
                soft_passed += 1

        elif rule.status == RuleStatus.ERROR:
            # Processing errors on hard rules are treated as failures
            if is_hard:
                hard_failed += 1
                has_failed_hard_rule = True
            else:
                soft_failed += 1

    # ─── Decision Tree ─────────────────────────────────────
    # Step 1: Any failed hard rule → NOT_ELIGIBLE
    if has_failed_hard_rule:
        verdict = VerdictEnum.NOT_ELIGIBLE
    # Step 2: All hard rules passed, but unverified citations → SEMI_ELIGIBLE
    elif has_unverified_citation:
        verdict = VerdictEnum.SEMI_ELIGIBLE
    # Step 3: All passed and verified → ELIGIBLE
    else:
        verdict = VerdictEnum.ELIGIBLE

    summary = {
        "total": len(rule_results),
        "hard_passed": hard_passed,
        "hard_failed": hard_failed,
        "soft_passed": soft_passed,
        "soft_failed": soft_failed,
        "unverified_citations": unverified_citations,
        "missing_documents": missing_documents,
    }

    logger.info(
        "verdict_computed",
        verdict=verdict.value,
        summary=summary,
    )

    return VerdictResponse(
        verdict=verdict,
        rule_results=rule_results,
        summary=summary,
    )
