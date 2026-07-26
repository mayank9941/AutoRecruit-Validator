"""
Structured JSON extraction from a JD using Gemini.

This is the same logic that was validated in a standalone test script
(test_jd_parser.py) before being turned into a reusable service function
that the FastAPI router calls.
"""

import os
import json
import time
from datetime import date

from google import genai
from google.genai import errors as genai_errors

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# One shared client for the whole process -- constructing a new
# genai.Client per call throws away connection reuse, which matters once
# screening runs make many calls back-to-back (and in parallel).
_client: genai.Client | None = None


def _get_client() -> "genai.Client":
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _is_retryable(exc: Exception) -> bool:
    """
    Only transient failures are worth retrying (with sleeps). Auth errors,
    invalid requests, oversized prompts etc. will fail identically every
    attempt -- retrying those just burns 6-30s of sleep per criterion for
    nothing, which is exactly what made broken candidates so slow to fail.
    """
    if isinstance(exc, genai_errors.APIError):
        return exc.code in (408, 429, 500, 502, 503, 504)
    return True  # network hiccups / unknown errors -- retry

PROMPT_TEMPLATE = """
You are extracting structured data from a Job Description (JD) advertisement.

The JD may cover ONE post or MULTIPLE posts (roles) in a single advertisement.
For each distinct post you find, extract its title and eligibility criteria.

Extract ONLY criteria that matter for screening and can be VERIFIED against a
candidate's documents (certificates, marksheets, experience letters, CV):

1. AGE (type "age") -- the post's age limit(s), as stated.
2. EXPERIENCE (type "experience") -- ONLY requirements that state a required
   TOTAL number of years, explicitly as a number (e.g. "Minimum 5 years of
   post-qualification experience in ..."). Screening will add up the
   candidate's individual job periods and compare the sum against this
   number, so the number is the whole point. If the JD splits countable
   experience into multiple distinct numeric requirements (e.g. total years
   AND years in a specific role), keep those as separate experience
   criteria, each with its own explicit number.
   A requirement WITHOUT an explicit number of years ("proven track record
   of X", "hands-on experience with Y", "strong understanding of Z",
   "working knowledge of W") is NOT an experience criterion -- it belongs
   in the single skill criterion below.
3. EDUCATION (type "education") -- qualifications/degrees, as concretely as
   the JD states them (degree name, discipline, minimum marks). This
   includes DESIRABLE/preferred degrees (e.g. "Desirable: Master's degree /
   MBA / PGDM ...") -- keep those as separate education criteria whose
   description STARTS with the word "Desirable" (that word is what marks
   them non-mandatory downstream). Degree requirements NEVER belong in the
   skill criterion.
4. OTHER (type "other") -- ONLY for concrete, document-verifiable
   requirements that don't fit above (e.g. a mandatory certification,
   license, or professional registration).
5. SKILLS & QUALITATIVE EXPERIENCE (type "skill") -- create EXACTLY ONE
   criterion of type "skill" per post (at most one; none if the JD has no
   such requirements). Consolidate into its single description EVERY
   qualitative, non-numeric capability requirement the JD mentions:
   skills, tools, technologies, methodologies, domain familiarity, and
   qualitative experience ("proven track record of...", "hands-on
   experience with...", "strong understanding of...", "working knowledge
   of..."). Do NOT create separate criteria for these -- one consolidated
   list. During screening this criterion produces ONE overall match
   percentage and NEVER makes a candidate eligible or not eligible, so no
   mandatory/quantifiable requirement may be placed inside it -- and no
   degree/qualification requirement either (those are education criteria,
   even the desirable ones).

Do NOT create criteria for vague personality statements ("hardworking",
"positive attitude", "team player") -- drop those entirely.

Separately, check if the JD contains an "Age Relaxation" section/table --
this is a general table (usually applies to ALL posts in the JD, not
post-specific) that lists extra years added to the base age limit for
categories like SC, ST, OBC, EWS, PwD, Ex-servicemen, etc. This is
DIFFERENT from the post's base age criterion -- do not put it inside
any post's criteria list.

Return ONLY valid JSON, no markdown formatting, no backticks, no extra text.
Use exactly this shape:

{{
  "post_count": <integer>,
  "confidence": "high" | "medium" | "low",
  "ambiguity_notes": "<string, empty if none>",
  "posts": [
    {{
      "title": "<string>",
      "criteria": [
        {{
          "type": "education" | "experience" | "skill" | "age" | "other",
          "description": "<string, the exact requirement>"
        }}
      ]
    }}
  ],
  "age_relaxation": {{
    "mentioned_in_jd": <true | false>,
    "rules": [
      {{
        "category": "<string, e.g. SC, ST, OBC, EWS, PwD_General, PwD_SC_ST, PwD_OBC, Ex-Serviceman, J&K_Domicile, etc.>",
        "relaxation": "<string, e.g. '5 years', '3 years', 'service period + 3 years' -- keep it exactly as worded in the JD>"
      }}
    ]
  }}
}}

Rules:
- If you are unsure whether the JD has 1 post or more than 1, set confidence
  to "low" or "medium" and explain briefly in ambiguity_notes.
- Do not invent criteria that aren't stated or clearly implied in the text.
- If a post's criteria section is unclear/missing, still include the post
  with an empty criteria list, and mention it in ambiguity_notes.
- If the JD does NOT contain any age relaxation section/table, set
  "mentioned_in_jd" to false and "rules" to an empty list. Do not invent
  relaxation rules from general knowledge of government norms -- only
  extract what is explicitly written in this specific JD.

JD TEXT:
---
{jd_text}
---
"""


CRITERION_EVALUATION_PROMPT_TEMPLATE = """
You are evaluating whether a job candidate satisfies ONE specific eligibility
criterion, based only on the documents provided below.

CRITERION TO CHECK:
{criterion_description}

CANDIDATE DOCUMENTS (each section is marked with its source document name
and page number):
---
{document_context}
---

Return ONLY valid JSON, no markdown formatting, no backticks, no extra text.
Use exactly this shape:

{{
  "result": "pass" | "fail" | "uncertain",
  "citation": {{
    "document": "<the DOCUMENT name from the marker that supports your answer, or null if none found>",
    "page": <the PAGE number from the marker, or null if none found>
  }},
  "reasoning": "<one or two sentence explanation of why you reached this result>"
}}

Rules:
- Base your answer ONLY on what's explicitly stated in the documents. Do not
  assume or infer qualifications that aren't written down.
- "pass" means the documents clearly show the candidate meets this criterion.
- "fail" means the documents clearly show the candidate does NOT meet it.
- "uncertain" means the documents don't have enough information to decide
  either way -- in this case, citation can be null.
- IMPORTANT: distinguish between "information is simply absent" and "a
  complete record exists but doesn't include this qualification". If a
  document appears to be a COMPLETE record for a category -- e.g. a
  resume's education section that lists degrees from school through the
  highest qualification held, or a full work history -- and the specific
  requirement in question (e.g. a particular degree, certification, or
  type of experience) is not mentioned anywhere in that complete record,
  treat this as "fail", not "uncertain". The absence of a qualification
  in an otherwise complete listing is evidence the candidate does not
  hold it. Reserve "uncertain" for cases where the relevant section is
  missing entirely, cut off, or the documents don't cover that topic at
  all.
- The citation MUST point to the specific document and page where you found
  the supporting (or contradicting) evidence.
"""


class GeminiParsingError(Exception):
    """Raised when the Gemini call fails even after all retries, or the
    response isn't valid JSON."""
    pass


def evaluate_criterion_with_gemini(
    document_context: str, criterion_description: str, max_attempts: int = 4
) -> dict:
    """
    Evaluates ONE criterion against a candidate's document context.

    Returns {"result": "pass"/"fail"/"needs_review", "citation": {"document":
    ..., "page": ...}, "reasoning": ...}. Gemini's "uncertain" is normalized
    to "needs_review" here, so the rest of the system only ever has to deal
    with one consistent vocabulary (matching the rule-based age check's
    "needs_review" outcome too).
    """
    if not GEMINI_API_KEY:
        raise GeminiParsingError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in a .env file or in the environment."
        )

    client = _get_client()
    prompt = CRITERION_EVALUATION_PROMPT_TEMPLATE.format(
        criterion_description=criterion_description,
        document_context=document_context,
    )

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-3.5-flash",
                contents=prompt,
                config={"thinking_config": {"thinking_level": "low"}},
            )
            raw = response.text.strip()

            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            result = json.loads(raw)

            # Defensive normalization -- Gemini occasionally returns
            # "citation": null instead of a dict with null fields.
            if not isinstance(result.get("citation"), dict):
                result["citation"] = {"document": None, "page": None}
            else:
                result["citation"].setdefault("document", None)
                result["citation"].setdefault("page", None)

            if result.get("result") == "uncertain":
                result["result"] = "needs_review"

            return result

        except json.JSONDecodeError as e:
            last_error = e
        except Exception as e:
            last_error = e
            if not _is_retryable(e):
                break

        if attempt < max_attempts:
            time.sleep(2 * attempt)

    raise GeminiParsingError(
        f"Gemini did not return a valid response even after {max_attempts} attempts: {last_error}"
    )


BATCH_CRITERIA_EVALUATION_PROMPT_TEMPLATE = """
You are evaluating whether a job candidate satisfies EACH of the eligibility
criteria listed below, based only on the documents provided. Evaluate every
criterion INDEPENDENTLY -- one criterion's result must not influence another's.
Each criterion is tagged with its TYPE in [brackets] -- type-specific rules
below tell you exactly how to evaluate each type.

TODAY'S DATE: {today} -- use this for all date arithmetic (e.g. computing
the duration of a job listed as "present" / ongoing).

CRITERIA TO CHECK (numbered, each tagged with its type):
{criteria_list}

CANDIDATE'S DECLARED APPLICATION DATA (what the candidate claimed on their
application form / Excel roster -- claims, NOT proof):
---
{declared_data}
---

CANDIDATE DOCUMENTS (each section is marked with its source document name
and page number -- this is the PROOF):
---
{document_context}
---

EVERY criterion is verified in TWO STAGES:
  STAGE 1 -- DECLARED vs JD: does the candidate's declared application data
  satisfy the criterion?
  STAGE 2 -- DOCUMENTS vs DECLARED: do the candidate's documents actually
  prove what was declared (same qualification, same dates, same values)?
"pass" requires BOTH stages to hold. A declaration that satisfies the JD but
is contradicted by the documents, or not evidenced in them, does NOT count.
A declaration that doesn't satisfy the JD is a "fail" regardless of what the
documents say. The reasoning MUST cover both stages explicitly.

Return ONLY valid JSON, no markdown formatting, no backticks, no extra text.
Return a JSON array containing EXACTLY one entry per criterion above, in the
same order, using exactly this shape:

[
  {{
    "index": <the criterion's number from the list above>,
    "result": "pass" | "fail" | "uncertain",
    "match_percentage": <integer 0-100 for [experience] and [skill] criteria; null for every other type>,
    "citation": {{
      "document": "<the DOCUMENT name from the marker that supports your answer, or null if none found>",
      "page": <the PAGE number from the marker, or null if none found>
    }},
    "reasoning": "<explanation of why you reached this result -- see the type-specific rules for what it must contain>"
  }}
]

TYPE-SPECIFIC RULES:

[experience] -- the criterion states a required TOTAL number of years,
usually IN A SPECIFIC FIELD ("5 years of product management experience",
"2 years owning a B2C mobile application"). The years must be in that
field: judge each job's field from its title, role description, and
responsibilities in the documents. A job in an unrelated field contributes
ZERO years toward this criterion. If the criterion names no particular
field ("5 years of work experience"), then all documented experience
counts. Do the math, don't estimate:
  1. STAGE 1: check the experience the candidate DECLARED in their
     application data against the criterion -- both the number of years
     and the field.
  2. STAGE 2: find EVERY declared job/employment period and verify it in
     the documents (experience letters, salary slips, CV work history),
     each with organization, start/end dates, and role. Treat a current
     job with no end date as running until today. Only count periods that
     are actually DOCUMENTED -- a declared period with no verifiable dates
     in the documents contributes zero years.
  3. Decide for each documented job whether its role matches the
     criterion's field. Compute each MATCHING period's duration, then SUM
     them into total in-field documented experience. Count overlapping
     periods only once.
  4. "match_percentage" = round((documented in-field years / required
     years) x 100), capped at 100. E.g. 4 in-field years against 5
     required = 80.
  5. "result": "pass" if documented in-field years >= the required years,
     otherwise "fail". Experience that is undocumented OR in an unrelated
     field does NOT count. Never return "uncertain" for an experience
     criterion.
  6. The reasoning MUST show the calculation, explicitly saying which jobs
     counted as in-field and which were excluded and why, e.g.:
     "Org A (Product Manager, Jan 2015 - Jun 2018) = 3.4 yrs, counted;
     Org B (Systems Engineer, Jul 2018 - present) -- excluded, not product
     management; total in-field = 3.4 yrs < 5 required." When declared
     periods were excluded for missing/unreadable dates, say so too.

[skill] -- ONE consolidated list of the JD's qualitative skill/experience
requirements (tools, technologies, methodologies, domain familiarity, track
records). This is SCORED, never used to reject:
  - "result" MUST be "pass" (a skill criterion can never fail a candidate).
  - "match_percentage" = the percentage of the listed requirements that the
    declared data and documents together show credible evidence of (CV work
    descriptions, project details, certificates, tools named in experience
    letters), as an integer 0-100.
  - The reasoning MUST list which requirements matched and which are
    missing, e.g. "Matched 5/9: Figma, Jira/Agile, product roadmaps,
    Mixpanel, vendor management. Missing: payments/transaction platforms,
    reconciliation lifecycle, financial systems compliance, growth metrics."

[education] / [age] / [other] -- pass/fail/uncertain as usual, applying the
two-stage check: the declared qualification must satisfy the criterion AND
the documents must prove that declared qualification (same degree, same
institution details, same values). A mismatch between declaration and
documents is a "fail".

GENERAL RULES (every criterion):
- Base your answer ONLY on what's explicitly stated in the documents. Do not
  assume or infer qualifications that aren't written down.
- "pass" means the documents clearly show the candidate meets the criterion.
- "fail" means the documents clearly show the candidate does NOT meet it.
- "uncertain" means the documents don't have enough information to decide
  either way -- in this case, citation fields can be null.
- IMPORTANT: distinguish between "information is simply absent" and "a
  complete record exists but doesn't include this qualification". If a
  document appears to be a COMPLETE record for a category -- e.g. a
  resume's education section that lists degrees from school through the
  highest qualification held, or a full work history -- and the specific
  requirement in question (e.g. a particular degree, certification, or
  type of experience) is not mentioned anywhere in that complete record,
  treat this as "fail", not "uncertain". The absence of a qualification
  in an otherwise complete listing is evidence the candidate does not
  hold it. Reserve "uncertain" for cases where the relevant section is
  missing entirely, cut off, or the documents don't cover that topic at
  all.
- Each entry's citation MUST point to the specific document and page where
  you found the supporting (or contradicting) evidence for THAT criterion.
"""


def _normalize_batch_results(parsed, criterion_types: list[str]) -> list[dict]:
    """
    Validates + normalizes a batch evaluation response. Raises ValueError
    if the response doesn't cover every criterion exactly once -- treated
    as a failed attempt by the caller (retried).

    `criterion_types` gives the type of each criterion (in prompt order) so
    experience entries can be held to their special contract: a match
    percentage (documented years vs required years) plus a hard pass/fail --
    experience that isn't documented doesn't count, so "uncertain" is never
    allowed for experience.
    """
    expected_count = len(criterion_types)
    if not isinstance(parsed, list):
        raise ValueError("batch response is not a JSON array")

    by_index: dict[int, dict] = {}
    for entry in parsed:
        if not isinstance(entry, dict):
            raise ValueError("batch response entry is not an object")
        idx = entry.get("index")
        if not isinstance(idx, int) or not (1 <= idx <= expected_count):
            raise ValueError(f"batch response has invalid criterion index: {idx!r}")

        # Same defensive normalization as the single-criterion path.
        if not isinstance(entry.get("citation"), dict):
            entry["citation"] = {"document": None, "page": None}
        else:
            entry["citation"].setdefault("document", None)
            entry["citation"].setdefault("page", None)

        if entry.get("result") == "uncertain":
            entry["result"] = "needs_review"
        if entry.get("result") not in ("pass", "fail", "needs_review"):
            raise ValueError(f"batch response has invalid result for criterion {idx}")

        criterion_type = criterion_types[idx - 1]
        if criterion_type in ("experience", "skill"):
            pct = entry.get("match_percentage")
            if isinstance(pct, float):
                pct = round(pct)
            if not isinstance(pct, int):
                raise ValueError(f"{criterion_type} criterion {idx} is missing match_percentage")
            entry["match_percentage"] = max(0, min(100, pct))
            if criterion_type == "skill":
                # Skills are informational -- a percentage, never a rejection.
                entry["result"] = "pass"
            elif entry["result"] == "needs_review":
                # Experience is binary: documented total either meets the
                # requirement or it doesn't. Undocumented experience doesn't
                # count, so "uncertain" collapses to "fail".
                entry["result"] = "fail"
        else:
            entry["match_percentage"] = None

        by_index[idx] = entry

    if len(by_index) != expected_count:
        raise ValueError(
            f"batch response covered {len(by_index)} criteria, expected {expected_count}"
        )
    return [by_index[i] for i in range(1, expected_count + 1)]


def evaluate_criteria_batch_with_gemini(
    document_context: str, criteria: list[dict], declared_data: str = "", max_attempts: int = 4
) -> list[dict]:
    """
    Evaluates ALL of a candidate's non-age criteria in ONE Gemini call,
    instead of one call per criterion -- the document context (by far the
    bulk of the prompt) is sent once instead of once per criterion.

    `criteria` is a list of {"type": ..., "description": ...} dicts. The
    type drives how each criterion is judged: experience criteria sum the
    candidate's DOCUMENTED job periods, compare the total against the
    required years (a percentage), and hard-fail when the documents don't
    evidence enough experience -- undocumented experience doesn't count.

    Returns one result dict per criterion, in the same order as `criteria`,
    each shaped like evaluate_criterion_with_gemini()'s return value plus a
    "match_percentage" key (an int for experience criteria, None otherwise).

    If Gemini can't produce a valid batch response after all retries, falls
    back to the proven one-call-per-criterion path rather than failing the
    candidate outright.
    """
    if not criteria:
        return []
    if not GEMINI_API_KEY:
        raise GeminiParsingError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in a .env file or in the environment."
        )

    criterion_types = [c["type"] for c in criteria]
    criteria_list = "\n".join(
        f"{i}. [{c['type']}] {c['description']}" for i, c in enumerate(criteria, start=1)
    )
    prompt = BATCH_CRITERIA_EVALUATION_PROMPT_TEMPLATE.format(
        today=date.today().isoformat(),
        criteria_list=criteria_list,
        declared_data=declared_data or "(no declared application data available)",
        document_context=document_context,
    )
    client = _get_client()

    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-3.5-flash",
                contents=prompt,
                config={"thinking_config": {"thinking_level": "low"}},
            )
            raw = response.text.strip()

            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            return _normalize_batch_results(json.loads(raw), criterion_types)

        except (json.JSONDecodeError, ValueError):
            pass  # malformed/incomplete batch response -- retry
        except Exception as e:
            if not _is_retryable(e):
                break

        if attempt < max_attempts:
            time.sleep(2 * attempt)

    # Fallback: the slower but battle-tested single-criterion path. The
    # single-criterion prompt has no percentage contract, so experience and
    # skill criteria keep their hard rules but lose the percentage (None).
    fallback_results = []
    for criterion in criteria:
        result = evaluate_criterion_with_gemini(document_context, criterion["description"])
        result["match_percentage"] = None
        if criterion["type"] == "skill":
            result["result"] = "pass"  # skills never reject
        elif criterion["type"] == "experience" and result["result"] == "needs_review":
            result["result"] = "fail"  # undocumented experience doesn't count
        fallback_results.append(result)
    return fallback_results


def parse_jd_with_gemini(jd_text: str, max_attempts: int = 4) -> dict:
    if not GEMINI_API_KEY:
        raise GeminiParsingError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in a .env file or in the environment."
        )

    client = _get_client()
    prompt = PROMPT_TEMPLATE.format(jd_text=jd_text)

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-3.5-flash",
                contents=prompt,
                config={"thinking_config": {"thinking_level": "low"}},
            )
            raw = response.text.strip()

            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            return json.loads(raw)

        except json.JSONDecodeError as e:
            # Gemini returned invalid JSON -- retrying may fix it
            last_error = e
        except Exception as e:
            last_error = e
            if not _is_retryable(e):
                break

        if attempt < max_attempts:
            time.sleep(2 * attempt)

    raise GeminiParsingError(
        f"Gemini did not return a valid response even after {max_attempts} attempts: {last_error}"
    )


DOCUMENT_TRANSCRIPTION_IMAGE_PROMPT = """
You are transcribing a scanned page of a candidate's document (marksheet,
degree certificate, experience letter, payslip, etc.) so its contents can
be used for automated screening. The scan may be rotated, low-resolution,
or have glare -- read it as carefully as a human reviewer would.

Transcribe ALL text visible in the image, faithfully and completely --
names, dates of birth, institution and board names, degree titles, marks,
employer names, job titles, employment start/end dates, amounts. Preserve
the reading order. Do NOT summarize, interpret, or add commentary. If a
word is illegible, write [illegible].

Return ONLY the transcribed plain text, nothing else. If the image contains
no readable text at all, return exactly: [no readable text]
"""


def transcribe_document_image_with_gemini(
    image_bytes: bytes, mime_type: str = "image/png", max_attempts: int = 3
) -> str:
    """
    OCR for scanned/image-based document pages: the rendered page image is
    sent to Gemini's vision capability and the full text transcript comes
    back. Used as a fallback when a PDF has no embedded text layer, so
    screening isn't blind to scanned marksheets/certificates/letters.
    """
    if not GEMINI_API_KEY:
        raise GeminiParsingError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in your .env file or environment."
        )

    from google.genai import types

    client = _get_client()
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-3.5-flash",
                contents=[image_part, DOCUMENT_TRANSCRIPTION_IMAGE_PROMPT],
                config={"thinking_config": {"thinking_level": "low"}},
            )
            return (response.text or "").strip()
        except Exception as e:
            last_error = e
            if not _is_retryable(e):
                break

        if attempt < max_attempts:
            time.sleep(2 * attempt)

    raise GeminiParsingError(
        f"Gemini transcription failed after {max_attempts} attempts: {last_error}"
    )
