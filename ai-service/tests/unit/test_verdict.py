"""
Unit tests for the Deterministic Verdict Engine.

Per implementation plan Phase 6:
  "Unit test this function exhaustively — every combination of pass/fail/unverified/missing
   across a small rule set. This function is small enough to have 100% branch coverage;
   there's no excuse not to."
"""

import pytest

from app.models.verdict import RuleResult, RuleStatus, VerdictEnum
from app.verdict import compute_verdict


def _make_rule(
    rule: str = "test_rule",
    rule_type: str = "hard",
    status: RuleStatus = RuleStatus.PASSED,
    citation_verified: bool | None = None,
) -> RuleResult:
    """Helper to create a RuleResult with minimal boilerplate."""
    return RuleResult(
        rule=rule,
        rule_type=rule_type,
        status=status,
        citation_verified=citation_verified,
    )


class TestComputeVerdict:
    """Exhaustive tests for the verdict engine."""

    # ─── ELIGIBLE cases ────────────────────────────────────

    def test_all_hard_rules_passed_all_citations_verified(self):
        """All hard rules pass with verified citations → ELIGIBLE."""
        rules = [
            _make_rule("age_check", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("education", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("experience", "hard", RuleStatus.PASSED, citation_verified=True),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.ELIGIBLE

    def test_hard_pass_no_citation_needed(self):
        """Hard rules pass without needing citation (None) → ELIGIBLE."""
        rules = [
            _make_rule("age_check", "hard", RuleStatus.PASSED, citation_verified=None),
            _make_rule("nationality", "hard", RuleStatus.PASSED, citation_verified=None),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.ELIGIBLE

    def test_soft_fail_does_not_affect_verdict(self):
        """Soft rule failures do not prevent ELIGIBLE verdict."""
        rules = [
            _make_rule("age_check", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("preferred_skill", "soft", RuleStatus.FAILED),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.ELIGIBLE

    def test_single_hard_rule_pass(self):
        """Single hard rule passing → ELIGIBLE."""
        rules = [_make_rule("only_rule", "hard", RuleStatus.PASSED, citation_verified=True)]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.ELIGIBLE

    # ─── SEMI_ELIGIBLE cases ───────────────────────────────

    def test_hard_pass_one_unverified_citation(self):
        """All hard rules pass but one citation unverified → SEMI_ELIGIBLE."""
        rules = [
            _make_rule("age_check", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("education", "hard", RuleStatus.PASSED, citation_verified=False),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.SEMI_ELIGIBLE

    def test_hard_pass_all_unverified_citations(self):
        """All hard rules pass, all citations unverified → SEMI_ELIGIBLE."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=False),
            _make_rule("r2", "hard", RuleStatus.PASSED, citation_verified=False),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.SEMI_ELIGIBLE

    def test_unverified_status_triggers_semi_eligible(self):
        """Rules with UNVERIFIED status → SEMI_ELIGIBLE."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "hard", RuleStatus.UNVERIFIED),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.SEMI_ELIGIBLE

    def test_soft_unverified_still_semi_eligible(self):
        """Even soft rule unverified → SEMI_ELIGIBLE (citation trust matters)."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "soft", RuleStatus.PASSED, citation_verified=False),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.SEMI_ELIGIBLE

    # ─── NOT_ELIGIBLE cases ────────────────────────────────

    def test_single_hard_rule_failed(self):
        """One hard rule fails → NOT_ELIGIBLE."""
        rules = [
            _make_rule("age_check", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("education", "hard", RuleStatus.FAILED),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.NOT_ELIGIBLE

    def test_all_hard_rules_failed(self):
        """All hard rules fail → NOT_ELIGIBLE."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.FAILED),
            _make_rule("r2", "hard", RuleStatus.FAILED),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.NOT_ELIGIBLE

    def test_missing_document_hard_rule(self):
        """Missing document on hard rule → NOT_ELIGIBLE (per assumption A4)."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "hard", RuleStatus.MISSING_DOCUMENT),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.NOT_ELIGIBLE

    def test_error_on_hard_rule(self):
        """Processing error on hard rule → NOT_ELIGIBLE."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "hard", RuleStatus.ERROR),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.NOT_ELIGIBLE

    def test_hard_fail_overrides_unverified_citation(self):
        """Hard fail takes precedence over unverified citations → NOT_ELIGIBLE, not SEMI."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.FAILED),
            _make_rule("r2", "hard", RuleStatus.PASSED, citation_verified=False),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.NOT_ELIGIBLE

    def test_missing_document_soft_does_not_fail(self):
        """Missing document on soft rule → does not cause NOT_ELIGIBLE."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "soft", RuleStatus.MISSING_DOCUMENT),
        ]
        result = compute_verdict(rules)
        # Soft failure doesn't affect verdict
        assert result.verdict == VerdictEnum.ELIGIBLE

    # ─── Edge cases ────────────────────────────────────────

    def test_empty_rules_returns_not_eligible(self):
        """No rules → NOT_ELIGIBLE (conservative default)."""
        result = compute_verdict([])
        assert result.verdict == VerdictEnum.NOT_ELIGIBLE
        assert result.summary["total"] == 0

    def test_summary_counts_are_correct(self):
        """Verify summary counts match actual rule states."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "hard", RuleStatus.FAILED),
            _make_rule("r3", "soft", RuleStatus.PASSED, citation_verified=False),
            _make_rule("r4", "soft", RuleStatus.FAILED),
            _make_rule("r5", "hard", RuleStatus.MISSING_DOCUMENT),
        ]
        result = compute_verdict(rules)
        assert result.summary["total"] == 5
        assert result.summary["hard_passed"] == 1
        assert result.summary["hard_failed"] == 2  # r2 failed + r5 missing doc
        assert result.summary["soft_passed"] == 1
        assert result.summary["soft_failed"] == 1
        assert result.summary["unverified_citations"] == 1
        assert result.summary["missing_documents"] == 1

    def test_only_soft_rules_all_pass(self):
        """Only soft rules, all pass → ELIGIBLE."""
        rules = [
            _make_rule("r1", "soft", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "soft", RuleStatus.PASSED, citation_verified=True),
        ]
        result = compute_verdict(rules)
        assert result.verdict == VerdictEnum.ELIGIBLE

    def test_mixed_scenario_complex(self):
        """Complex mixed scenario: 3 hard pass, 1 hard unverified, 2 soft fail."""
        rules = [
            _make_rule("age", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("education", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("experience", "hard", RuleStatus.PASSED, citation_verified=False),
            _make_rule("skill1", "soft", RuleStatus.FAILED),
            _make_rule("skill2", "soft", RuleStatus.FAILED),
        ]
        result = compute_verdict(rules)
        # All hard rules passed but one has unverified citation → SEMI_ELIGIBLE
        assert result.verdict == VerdictEnum.SEMI_ELIGIBLE

    def test_soft_rule_unverified(self):
        """Soft rule with UNVERIFIED status should increment soft_passed."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "soft", RuleStatus.UNVERIFIED),
        ]
        result = compute_verdict(rules)
        assert result.summary["soft_passed"] == 1
        assert result.verdict == VerdictEnum.SEMI_ELIGIBLE

    def test_soft_rule_error(self):
        """Soft rule with ERROR status should increment soft_failed."""
        rules = [
            _make_rule("r1", "hard", RuleStatus.PASSED, citation_verified=True),
            _make_rule("r2", "soft", RuleStatus.ERROR),
        ]
        result = compute_verdict(rules)
        assert result.summary["soft_failed"] == 1
        assert result.verdict == VerdictEnum.ELIGIBLE
