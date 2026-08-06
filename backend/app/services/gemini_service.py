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

# One place to switch models for every Gemini call this service makes.
# NOTE: the thinking config is family-specific -- the 2.5 family used
# thinking_budget (0 disables thinking), while the 3.x family replaced it
# with thinking_level ("low"/"high"). Change BOTH together when moving
# between families.
#
# gemini-2.5-flash was tried (Aug 2026) and is NOT available on this
# account: Google returns 404 "no longer available to new users" -- the
# 2.5 family is closed to accounts created after the 3.x launch.
GEMINI_MODEL = "gemini-3.5-flash"
GEMINI_GENERATION_CONFIG = {"thinking_config": {"thinking_level": "low"}}

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
- A resume/CV statement is the candidate's own claim, not proof. If the
  criterion concerns a formal qualification (a degree, certificate,
  category, date of birth) and only the resume mentions it -- with no
  supporting document (certificate, letter, official record) anywhere in
  the context -- return "uncertain" and start the reasoning with
  "Document incomplete:", naming the missing proof.
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
                model=GEMINI_MODEL,
                contents=prompt,
                config=GEMINI_GENERATION_CONFIG,
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
"pass" requires BOTH stages to hold. A declaration that doesn't satisfy the
JD is a "fail" regardless of what the documents say. When the declaration
DOES satisfy the JD, stage 2 decides:
  - the documents CONTRADICT the declaration (different degree, different
    dates, different values) -> "fail".
  - the documents PROVE the declaration -> "pass".
  - the claim appears only in the resume/CV or application data, and the
    supporting document that would actually prove it (degree certificate,
    category certificate, experience letter, official record) is nowhere in
    the documents -> "uncertain", NOT "fail". A resume is the candidate's
    own claim, not proof. Start the reasoning with "Document incomplete:"
    and name the missing proof.
([experience] and [skill] criteria override this with their own type-specific
rules below.) The reasoning MUST cover both stages explicitly.

Return ONLY valid JSON, no markdown formatting, no backticks, no extra text.
Return a JSON array containing EXACTLY one entry per criterion above, in the
same order, using exactly this shape:

[
  {{
    "index": <the criterion's number from the list above>,
    "result": "pass" | "fail" | "uncertain",
    "match_percentage": <integer 0-100 for [experience] and [skill] criteria; null for every other type>,
    "matched_items": <[skill] criteria only: array of the listed requirements with DIRECT evidence; null for other types>,
    "missing_items": <[skill] criteria only: array of the listed requirements without direct evidence; null for other types>,
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
  2. STAGE 2: verify EVERY declared job/employment period against the
     documents. A period counts as DOCUMENTED only when an uploaded
     experience/relieving certificate from that company states BOTH the
     joining date AND the resign/relieving date. A resume/CV work-history
     entry, a salary slip, or a joining letter alone is NOT sufficient
     proof. ONE exception: for the candidate's CURRENT employer (their
     most recent job, declared as ongoing), a joining letter alone IS
     acceptable -- treat that job as running from its joining date until
     today.
  3. Decide for each documented job whether its role matches the
     criterion's field. Compute each MATCHING period's duration, then SUM
     them into total in-field documented experience. Count overlapping
     periods only once.
  4. "match_percentage" = round((documented in-field years / required
     years) x 100), capped at 100. E.g. 4 in-field years against 5
     required = 80.
  5. "result": "pass" if documented in-field years >= the required years.
     Otherwise:
       - "uncertain" if one or more declared in-field periods were
         excluded ONLY because their proof was missing or incomplete (no
         certificate at all, or a certificate/joining letter without the
         resign date for a past employer), AND counting those declared
         periods would meet the requirement. Start the reasoning with
         "Document incomplete:" and name each such job and what proof is
         missing.
       - "fail" in every other case -- the declared experience itself
         doesn't satisfy the criterion, or the documented shortfall isn't
         caused by missing/incomplete documents (e.g. jobs in an
         unrelated field).
  6. The reasoning MUST show the calculation, explicitly saying which jobs
     counted as in-field and which were excluded and why, e.g.:
     "Org A (Product Manager, Jan 2015 - Jun 2018) = 3.4 yrs, counted;
     Org B (Systems Engineer, Jul 2018 - present) -- excluded, not product
     management; total in-field = 3.4 yrs < 5 required." When declared
     periods were excluded for missing/unreadable dates, say so too.

[skill] -- ONE consolidated list of the JD's qualitative skill/experience
requirements (tools, technologies, methodologies, domain familiarity, track
records). This is SCORED item by item:
  1. Break the criterion's description into its individual listed
     requirements/items.
  2. For EACH item, decide STRICTLY:
     - MATCHED: the documents/declared data show DIRECT, explicit evidence
       of that specific item -- the same skill, tool, domain, or an
       unambiguous equivalent, actually named.
     - MISSING: no evidence, or only related/adjacent/generic evidence.
       Related is NOT matched: working at an "infrastructure company" does
       NOT match "road/highway sector or InvIT experience"; "Excel" does
       NOT match "Mixpanel/Amplitude"; "managed projects" does NOT match
       "Agile/Scrum with Jira". When in doubt, the item is MISSING.
  3. Fill "matched_items" and "missing_items" so every item appears in
     exactly one of the two arrays.
  4. "match_percentage" = round(100 x matched / total). It MUST agree with
     your own two arrays -- if your reasoning says something is missing, it
     cannot be counted as matched. Never inflate.
  5. "result" MUST be "pass" (the score itself never fails a candidate --
     any pass/fail threshold is applied separately by the system).
  6. The reasoning MUST briefly cite the evidence for each matched item
     (which document/role showed it) and plainly list what is missing.

[education] / [age] / [other] -- pass/fail/uncertain as usual, applying the
two-stage check: the declared qualification must satisfy the criterion AND
the documents must prove that declared qualification (same degree, same
institution details, same values). A mismatch between declaration and
documents is a "fail". A declaration that satisfies the criterion but is
backed only by the resume -- the actual proof document being missing -- is
"uncertain" with the reasoning prefixed "Document incomplete:", per the
stage rules above.

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
    percentage (documented years vs required years) plus pass/fail/
    needs_review -- needs_review meaning the shortfall is caused purely by
    missing/incomplete proof documents (e.g. a certificate without a resign
    date), which HR must resolve manually.
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
        if criterion_type == "skill":
            # The percentage is recomputed HERE from the model's own
            # matched/missing lists -- the model's arithmetic occasionally
            # contradicts its own reasoning (e.g. "no road/highway
            # experience found" yet 100%). The lists are the ground truth.
            matched = entry.get("matched_items")
            missing = entry.get("missing_items")
            if isinstance(matched, list) and isinstance(missing, list) and (matched or missing):
                entry["match_percentage"] = round(100 * len(matched) / (len(matched) + len(missing)))
            else:
                pct = entry.get("match_percentage")
                if isinstance(pct, float):
                    pct = round(pct)
                if not isinstance(pct, int):
                    raise ValueError(f"skill criterion {idx} is missing match_percentage")
                entry["match_percentage"] = max(0, min(100, pct))
            # Skills are informational -- a percentage, never a rejection
            # (any threshold gating is applied by candidate_evaluation).
            entry["result"] = "pass"
        elif criterion_type == "experience":
            pct = entry.get("match_percentage")
            if isinstance(pct, float):
                pct = round(pct)
            if not isinstance(pct, int):
                raise ValueError(f"experience criterion {idx} is missing match_percentage")
            entry["match_percentage"] = max(0, min(100, pct))
            # "needs_review" is allowed for experience: it means declared
            # periods were excluded only because their proof was missing or
            # incomplete (e.g. a certificate without a resign date for a
            # past employer) -- HR must check the documents manually.
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
    candidate's DOCUMENTED job periods (proof = an experience certificate
    with both joining and resign dates; a joining letter alone counts only
    for the current employer, running until today) and compare the total
    against the required years (a percentage). Declared periods whose proof
    is missing or incomplete don't count -- they yield "needs_review"
    ("Document incomplete") when they are what stands between the candidate
    and a pass, and "fail" otherwise.

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
                model=GEMINI_MODEL,
                contents=prompt,
                config=GEMINI_GENERATION_CONFIG,
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
                model=GEMINI_MODEL,
                contents=prompt,
                config=GEMINI_GENERATION_CONFIG,
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
                model=GEMINI_MODEL,
                contents=[image_part, DOCUMENT_TRANSCRIPTION_IMAGE_PROMPT],
                config=GEMINI_GENERATION_CONFIG,
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
