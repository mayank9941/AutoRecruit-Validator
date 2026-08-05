"""
Candidate evaluation service.

Orchestrates the full screening of one candidate against one Job Profile's
criteria:
  - "age" type criteria are evaluated with pure rule-based logic (DOB +
    relaxation table), never sent to Gemini -- age is a calculable fact,
    not something an LLM should be asked to judge.
  - All other criteria types (education/experience/skill/other) are sent
    to Gemini in ONE batched call, with a citation attached to each result.
  - Once every criterion has a result, a final bucket is computed from
    the ESSENTIAL criteria only (desirable/preferred criteria are still
    evaluated and shown, but don't gate eligibility).

This logic was validated as standalone scripts (test_criterion_evaluation.py,
test_full_evaluation.py) against real candidate documents before being wired
in here.
"""

import os
from datetime import date

from app.models.job_profile import JobProfile, Criterion
from app.models.candidate import Candidate, CandidateDocument
from app.models.criterion_evaluation import CriterionEvaluation
from app.services.gemini_service import evaluate_criteria_batch_with_gemini
from app.services.pdf_extraction import extract_marked_pdf_text_with_ocr, pdf_text_is_meaningful
from app.services.age_relaxation import evaluate_age_criterion, parse_age_limits_from_text


def build_document_context(documents: list[CandidateDocument]) -> str:
    """
    Builds one text blob covering every PDF document for a candidate, with
    clear markers around each page so Gemini can cite exactly where it
    found something. Non-PDF documents (photograph, signature images)
    carry no evaluable text and are skipped.

    Uses the text cached on CandidateDocument.extracted_text (populated at
    ingestion time). Scanned/image PDFs -- which have no text layer, so
    ingestion caches nothing useful for them -- are extracted here through
    the Gemini-vision OCR fallback and written back, so each scanned page
    is transcribed once, ever. The caller's commit persists the backfill.
    """
    context_parts = []

    for doc in documents:
        is_pdf = doc.file_path.lower().endswith(".pdf")

        if not is_pdf:
            # Photos/signatures carry no evaluable text.
            if doc.extracted_text is None:
                doc.extracted_text = ""
            continue

        if doc.extracted_text is not None and pdf_text_is_meaningful(doc.extracted_text):
            context_parts.append(doc.extracted_text)
            continue

        if not os.path.exists(doc.file_path):
            continue

        try:
            # Full extraction with OCR fallback for scanned pages. Also
            # covers rows cached before OCR existed (marker-only text).
            doc.extracted_text = extract_marked_pdf_text_with_ocr(
                doc.file_path, doc.original_filename
            )
        except Exception:
            # A single unreadable/corrupt document shouldn't block
            # evaluation of the rest -- just skip it.
            continue

        if doc.extracted_text:
            context_parts.append(doc.extracted_text)

    return "\n".join(context_parts)


def build_declared_data_context(candidate: Candidate) -> str:
    """
    Formats the candidate's declared application data (their Excel roster
    row, captured at ingestion) for the evaluation prompt. Every criterion
    is checked in two stages -- declared-vs-JD, then documents-vs-declared
    -- so the model needs the declarations alongside the document proof.

    Document URL values are skipped: they're internal file references, not
    something the candidate declared.
    """
    data = candidate.raw_excel_data or {}
    lines = []
    for key, value in data.items():
        if value is None:
            continue
        text = str(value).strip()
        if not text or text.lower() in ("nan", "n/a", "na", "none"):
            continue
        if text.lower().startswith("http"):
            continue
        lines.append(f"{key}: {text}")
    return "\n".join(lines)


def compute_final_status(evaluations: list[CriterionEvaluation], criteria_by_id: dict) -> str:
    """
    Final bucket logic:
        - any ESSENTIAL criterion result == "fail"          -> not_eligible
        - no essential fails, but any essential is           -> needs_review
          "needs_review"
        - all essential criteria pass                        -> eligible

    The consolidated SKILL criterion is non-essential by default (its match
    percentage is informational). It participates here only when HR has
    explicitly marked it essential -- in which case its pass/fail was
    decided by the minimum-match-percentage threshold during evaluation.
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
    # A fresh evaluation REPLACES the candidate's previous results -- old
    # rows must go first, or re-screening appends a duplicate breakdown for
    # every criterion. (Runs in the caller's transaction: if evaluation
    # fails mid-way, the rollback restores the previous results.)
    db.query(CriterionEvaluation).filter(
        CriterionEvaluation.candidate_id == candidate.id
    ).delete(synchronize_session=False)

    document_context = build_document_context(candidate.documents)

    age_relaxation_rules_for_lookup = [
        {"normalized_category": r.normalized_category, "relaxation_text": r.relaxation_text}
        for r in profile.age_relaxation_rules
    ]

    created_evaluations: list[CriterionEvaluation] = []
    criteria_by_id = {}

    # All non-age criteria are evaluated in ONE Gemini call (the document
    # context -- by far the bulk of the prompt -- is sent once, not once
    # per criterion). Age criteria stay rule-based, never sent to Gemini.
    non_age_criteria = [c for c in profile.criteria if c.type != "age"]
    batch_results = evaluate_criteria_batch_with_gemini(
        document_context,
        [{"type": c.type, "description": c.description} for c in non_age_criteria],
        declared_data=build_declared_data_context(candidate),
    )
    gemini_result_by_criterion_id = {
        criterion.id: result for criterion, result in zip(non_age_criteria, batch_results)
    }

    for criterion in profile.criteria:
        criteria_by_id[criterion.id] = criterion

        if criterion.type == "age":
            # Rule-based, no Gemini -- age is a calculable fact.
            # The criterion's CURRENT description is the source of truth
            # for the limits, so HR edits take effect on the next screen;
            # the profile's JD-parse-time numbers are only the fallback
            # when the text has no parseable limits.
            desc_min, desc_max = parse_age_limits_from_text(criterion.description)
            limits_from_description = desc_min is not None or desc_max is not None
            result = evaluate_age_criterion(
                dob_str=candidate.dob,
                normalized_category=candidate.normalized_category,
                base_age_min=desc_min if limits_from_description else profile.base_age_min,
                base_age_max=desc_max if limits_from_description else profile.base_age_max,
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
            gemini_result = gemini_result_by_criterion_id[criterion.id]
            result_value = gemini_result["result"]
            reasoning = gemini_result["reasoning"]

            if criterion.type == "skill":
                # The skills score is informational by default. Only when HR
                # marked this criterion essential AND set a minimum match
                # percentage does it become a real gate.
                pct = gemini_result.get("match_percentage") or 0
                if criterion.is_essential and criterion.required_match_percentage is not None:
                    threshold = criterion.required_match_percentage
                    if pct >= threshold:
                        result_value = "pass"
                        reasoning = (
                            f"Skills match {pct}% meets the required minimum of {threshold}%. "
                            + (reasoning or "")
                        )
                    else:
                        result_value = "fail"
                        reasoning = (
                            f"Skills match {pct}% is below the required minimum of {threshold}%. "
                            + (reasoning or "")
                        )
                else:
                    result_value = "pass"

            evaluation = CriterionEvaluation(
                candidate_id=candidate.id,
                criterion_id=criterion.id,
                result=result_value,
                match_percentage=gemini_result.get("match_percentage"),
                citation_document=gemini_result["citation"]["document"],
                citation_page=gemini_result["citation"]["page"],
                reasoning=reasoning,
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
