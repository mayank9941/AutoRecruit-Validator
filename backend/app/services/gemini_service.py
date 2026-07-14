"""
Structured JSON extraction from a JD using Gemini.

This is the same logic that was validated in a standalone test script
(test_jd_parser.py) before being turned into a reusable service function
that the FastAPI router calls.
"""

import os
import json
import time

from google import genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

PROMPT_TEMPLATE = """
You are extracting structured data from a Job Description (JD) advertisement.

The JD may cover ONE post or MULTIPLE posts (roles) in a single advertisement.
For each distinct post you find, extract its title and eligibility criteria.

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

    client = genai.Client(api_key=GEMINI_API_KEY)
    prompt = CRITERION_EVALUATION_PROMPT_TEMPLATE.format(
        criterion_description=criterion_description,
        document_context=document_context,
    )

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
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

        if attempt < max_attempts:
            time.sleep(5 * attempt)

    raise GeminiParsingError(
        f"Gemini did not return a valid response even after {max_attempts} attempts: {last_error}"
    )


def parse_jd_with_gemini(jd_text: str, max_attempts: int = 4) -> dict:
    if not GEMINI_API_KEY:
        raise GeminiParsingError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in a .env file or in the environment."
        )

    client = genai.Client(api_key=GEMINI_API_KEY)
    prompt = PROMPT_TEMPLATE.format(jd_text=jd_text)

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
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

        if attempt < max_attempts:
            time.sleep(5 * attempt)

    raise GeminiParsingError(
        f"Gemini did not return a valid response even after {max_attempts} attempts: {last_error}"
    )


IDENTITY_EXTRACTION_PROMPT_TEMPLATE = """
You are extracting identity details from a candidate's document (such as a
10th standard marksheet/certificate) to verify their identity against
what they declared in their application form.

DOCUMENT TEXT:
---
{document_text}
---

Return ONLY valid JSON, no markdown formatting, no backticks, no extra text.
Use exactly this shape:

{{
  "name": "<the candidate's full name exactly as written in the document, or null if not found>",
  "date_of_birth": "<the date of birth exactly as written in the document, or null if not found>",
  "confidence": "high" | "medium" | "low"
}}

Rules:
- Only extract what is explicitly printed in the document. Do not guess or infer.
- "confidence" should be "low" if the document is unclear, the relevant
  text is ambiguous or partially cut off, or you are not fully sure of
  the extraction for any reason.
"""


def extract_identity_fields_with_gemini(document_text: str, max_attempts: int = 4) -> dict:
    """
    Extracts a candidate's name and date of birth as printed on a source
    document (e.g. their 10th marksheet), for cross-checking against the
    form data they submitted.
    """
    if not GEMINI_API_KEY:
        raise GeminiParsingError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in your .env file or environment."
        )

    client = genai.Client(api_key=GEMINI_API_KEY)
    prompt = IDENTITY_EXTRACTION_PROMPT_TEMPLATE.format(document_text=document_text)

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
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
            result.setdefault("name", None)
            result.setdefault("date_of_birth", None)
            result.setdefault("confidence", "low")
            return result

        except json.JSONDecodeError as e:
            last_error = e
        except Exception as e:
            last_error = e

        if attempt < max_attempts:
            time.sleep(5 * attempt)

    raise GeminiParsingError(
        f"Gemini did not return a valid response even after {max_attempts} attempts: {last_error}"
    )


IDENTITY_EXTRACTION_IMAGE_PROMPT = """
You are looking at an image of a candidate's document (such as a 10th
standard marksheet/certificate) to verify their identity against what
they declared in their application form. The document could be a scan
or photo, and may be slightly rotated, low-resolution, or have glare --
do your best to read it as a human reviewer would.

Return ONLY valid JSON, no markdown formatting, no backticks, no extra text.
Use exactly this shape:

{
  "name": "<the candidate's full name exactly as written in the document, or null if not found>",
  "date_of_birth": "<the date of birth exactly as written in the document, or null if not found>",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Only extract what is legible in the image. Do not guess or infer.
- "confidence" should be "low" if the image is blurry, cut off, rotated in
  a way that makes text hard to read, or you are not fully sure of the
  extraction for any reason.
"""


def extract_identity_fields_from_image_with_gemini(
    image_bytes: bytes, mime_type: str = "image/png", max_attempts: int = 4
) -> dict:
    """
    Same purpose as extract_identity_fields_with_gemini(), but for
    scanned/image-based documents that have no extractable text -- the
    image itself is sent to Gemini's vision capability instead of a text
    transcript.
    """
    if not GEMINI_API_KEY:
        raise GeminiParsingError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in your .env file or environment."
        )

    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=[image_part, IDENTITY_EXTRACTION_IMAGE_PROMPT],
                config={"thinking_config": {"thinking_level": "low"}},
            )
            raw = response.text.strip()

            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            result = json.loads(raw)
            result.setdefault("name", None)
            result.setdefault("date_of_birth", None)
            result.setdefault("confidence", "low")
            return result

        except json.JSONDecodeError as e:
            last_error = e
        except Exception as e:
            last_error = e

        if attempt < max_attempts:
            time.sleep(5 * attempt)

    raise GeminiParsingError(
        f"Gemini did not return a valid response even after {max_attempts} attempts: {last_error}"
    )
