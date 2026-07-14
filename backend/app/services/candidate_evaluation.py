"""
Candidate evaluation service.

Orchestrates the full screening of one candidate against one Job Profile's
criteria:
  - "age" type criteria are evaluated with pure rule-based logic (DOB +
    relaxation table), never sent to Gemini -- age is a calculable fact,
    not something an LLM should be asked to judge.
  - All other criteria types (education/experience/skill/other) are sent
    to Gemini, one at a time, with a citation attached to each result.
  - Once every criterion has a result, a final bucket is computed from
    the ESSENTIAL criteria only (desirable/preferred criteria are still
    evaluated and shown, but don't gate eligibility).

This logic was validated as standalone scripts (test_criterion_evaluation.py,
test_full_evaluation.py) against real candidate documents before being wired
in here.
"""

import os
from datetime import date

import pdfplumber

from app.models.job_profile import JobProfile, Criterion
from app.models.candidate import Candidate, CandidateDocument
from app.models.criterion_evaluation import CriterionEvaluation
from app.services.gemini_service import evaluate_criterion_with_gemini
from app.services.age_relaxation import evaluate_age_criterion


def build_document_context(documents: list[CandidateDocument]) -> str:
    """
    Builds one text blob covering every PDF document for a candidate, with
    clear markers around each page so Gemini can cite exactly where it
    found something. Non-PDF documents (photograph, signature images)
    carry no evaluable text and are skipped.
    """
    context_parts = []

    for doc in documents:
        if not doc.file_path.lower().endswith(".pdf"):
            continue
        if not os.path.exists(doc.file_path):
            continue

        try:
            with pdfplumber.open(doc.file_path) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    page_text = page.extract_text() or ""
                    context_parts.append(
                        f"--- DOCUMENT: {doc.original_filename} | PAGE: {page_num} ---\n{page_text}\n"
                    )
        except Exception:
            # A single unreadable/corrupt document shouldn't block
            # evaluation of the rest -- just skip it.
            continue

    return "\n".join(context_parts)


def compute_final_status(evaluations: list[CriterionEvaluation], criteria_by_id: dict) -> str:
    """
    Final bucket logic:
        - any ESSENTIAL criterion result == "fail"          -> not_eligible
        - no essential fails, but any essential is           -> needs_review
          "needs_review"
        - all essential criteria pass                        -> eligible
    """
    essential_results = [
        e.result for e in evaluations if criteria_by_id[e.criterion_id].is_essential
    ]

    if "fail" in essential_results:
        return "not_eligible"
    if "needs_review" in essential_results:
        return "needs_review"
    return "eligible"


def evaluate_candidate(db, candidate: Candidate, profile: JobProfile) -> list[CriterionEvaluation]:
    """
    Evaluates every criterion in `profile` against `candidate`, saves a
    CriterionEvaluation row for each, updates candidate.status, and
    returns the list of created evaluation rows.

    Assumes the caller has already checked candidate.ingestion_status ==
    "documents_complete" -- this function does not skip anything itself.
    """
    document_context = build_document_context(candidate.documents)

    age_relaxation_rules_for_lookup = [
        {"normalized_category": r.normalized_category, "relaxation_text": r.relaxation_text}
        for r in profile.age_relaxation_rules
    ]

    created_evaluations: list[CriterionEvaluation] = []
    criteria_by_id = {}

    for criterion in profile.criteria:
        criteria_by_id[criterion.id] = criterion

        if criterion.type == "age":
            # Rule-based, no Gemini -- age is a calculable fact.
            result = evaluate_age_criterion(
                dob_str=candidate.dob,
                normalized_category=candidate.normalized_category,
                base_age_min=profile.base_age_min,
                base_age_max=profile.base_age_max,
                age_relaxation_rules=age_relaxation_rules_for_lookup,
                as_of=date.today(),
            )
            evaluation = CriterionEvaluation(
                candidate_id=candidate.id,
                criterion_id=criterion.id,
                result=result["result"],
                citation_document=None,
                citation_page=None,
                reasoning=result["reasoning"],
            )
        else:
            gemini_result = evaluate_criterion_with_gemini(document_context, criterion.description)
            evaluation = CriterionEvaluation(
                candidate_id=candidate.id,
                criterion_id=criterion.id,
                result=gemini_result["result"],
                citation_document=gemini_result["citation"]["document"],
                citation_page=gemini_result["citation"]["page"],
                reasoning=gemini_result["reasoning"],
            )

        db.add(evaluation)
        created_evaluations.append(evaluation)

    final_status = compute_final_status(created_evaluations, criteria_by_id)

    # A fresh evaluation is the new authoritative assessment -- any prior
    # HR override is cleared, since it was based on an older (possibly
    # now-outdated) evaluation. HR can always re-override after reviewing
    # the new result.
    candidate.computed_status = final_status
    candidate.status = final_status
    candidate.status_overridden = False
    candidate.override_reason = None
    candidate.overridden_by = None
    candidate.overridden_at = None

    return created_evaluations
