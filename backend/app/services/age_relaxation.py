"""
Rule-based guardrails and normalization -- validates Gemini's raw output
and normalizes it into a consistent internal format.
"""

import re
from datetime import date, datetime


# ---- Age relaxation category normalization ----

NORMALIZATION_RULES = [
    ("PwD_SC_ST", ["disabilit", "sc/st"]),
    ("PwD_SC_ST", ["disabilit", "scheduled caste"]),
    ("PwD_OBC", ["disabilit", "obc"]),
    ("PwD_General", ["disabilit", "general"]),
    ("PwD_General", ["disabilit"]),
    ("Ex-Serviceman", ["ex-servicem", "ex servicem", "eco/ssco", "armed forces"]),
    ("Central_Govt_Employee", ["central govt", "central government", "continuous service"]),
    ("JK_Domicile", ["jammu", "kashmir", "j&k"]),
    ("SC", ["scheduled caste", "sc/st", "sc /st", "sc,st"]),
    ("ST", ["scheduled tribe"]),
    ("OBC", ["backward class", "obc"]),
    ("EWS", ["economically weaker", "ews"]),
    ("General", ["general", "unreserved", "ur"]),
]


def normalize_category(raw_category: str) -> str:
    text = raw_category.lower()
    for key, keywords in NORMALIZATION_RULES:
        if all(kw in text for kw in keywords):
            return key
    return f"UNMAPPED: {raw_category}"


# ---- Candidate's own category normalization (separate from the age
# relaxation rule categories above -- this normalizes the Category value
# that comes with each candidate's own record, e.g. from the Excel
# "Category" column) ----

CANDIDATE_CATEGORY_RULES = [
    ("SC", ["sc"]),
    ("ST", ["st"]),
    ("OBC", ["obc"]),
    ("EWS", ["ews"]),
    ("General", ["ur", "general", "unreserved"]),
]


def normalize_candidate_category(raw_category) -> str:
    """
    Normalizes a candidate's own category value (e.g. 'UR', 'OBC (NCL)',
    'SC') into the same fixed set of keys used by age relaxation rules,
    so the two can be matched directly during screening.
    """
    if raw_category is None:
        return "General"

    text = str(raw_category).strip().lower()
    if text in ("", "nan", "n/a", "na"):
        return "General"

    for key, keywords in CANDIDATE_CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return key

    return f"UNMAPPED: {raw_category}"


def parse_relaxation_years(relaxation_text: str) -> int | None:
    """
    Extracts a plain integer number of years from a relaxation string like
    '5 years' or '3 years'. Returns None if the text isn't a simple number
    of years (e.g. 'Period of Military Service plus 3 years' -- that
    depends on service duration, which isn't a fixed number we can compute
    automatically, and needs a human to work out).
    """
    text = relaxation_text.strip().lower()
    match = re.fullmatch(r"(\d+)\s*years?", text)
    if match:
        return int(match.group(1))
    return None


def parse_date_flexible(date_str: str) -> date | None:
    """
    Parses a date string in any of the common formats we see across the
    candidate data source and re-extracted documents. Returns None if it
    can't be parsed in any of them.
    """
    for fmt in (
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y",
        "%d.%m.%Y", "%Y.%m.%d",
    ):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except (ValueError, AttributeError):
            continue
    return None


def compute_age(dob_str: str, as_of: date) -> int | None:
    """Computes completed age in years as of a given date. Returns None if
    dob_str can't be parsed in any of the common formats we expect from
    the candidate data source."""
    dob = parse_date_flexible(dob_str)
    if dob is None:
        return None

    age = as_of.year - dob.year
    if (as_of.month, as_of.day) < (dob.month, dob.day):
        age -= 1
    return age


def evaluate_age_criterion(
    dob_str: str,
    normalized_category: str,
    base_age_min: int | None,
    base_age_max: int | None,
    age_relaxation_rules: list[dict],
    as_of: date,
) -> dict:
    """
    Rule-based age eligibility check -- deliberately NOT sent to Gemini.
    Age eligibility is a calculable fact (DOB + a cutoff date, plus a
    known relaxation table), not something an LLM should be asked to
    "judge" -- doing so risks silently wrong or inconsistent answers on
    a criterion that has one objectively correct answer.

    age_relaxation_rules: list of dicts like
        {"normalized_category": "SC", "relaxation_text": "5 years"}

    Returns {"result": "pass" | "fail" | "needs_review", "reasoning": str}
    """
    age = compute_age(dob_str, as_of)
    if age is None:
        return {
            "result": "needs_review",
            "reasoning": f"Could not parse the candidate's DOB ('{dob_str}') -- please verify manually.",
        }

    if base_age_max is None:
        return {
            "result": "needs_review",
            "reasoning": "No base age limit could be extracted from the JD for this profile -- please check manually.",
        }

    effective_max = base_age_max
    relaxation_years = None

    matching_rule = next(
        (r for r in age_relaxation_rules if r["normalized_category"] == normalized_category),
        None,
    )
    if matching_rule:
        relaxation_years = parse_relaxation_years(matching_rule["relaxation_text"])
        if relaxation_years is None:
            return {
                "result": "needs_review",
                "reasoning": (
                    f"A relaxation rule exists for category '{normalized_category}' "
                    f"('{matching_rule['relaxation_text']}'), but it isn't a simple number "
                    f"of years -- this needs to be calculated manually."
                ),
            }
        effective_max += relaxation_years

    min_ok = base_age_min is None or age >= base_age_min
    max_ok = age <= effective_max

    range_desc = f"{base_age_min if base_age_min is not None else 'N/A'}-{effective_max}"
    relaxation_note = (
        f" (base max {base_age_max} + {relaxation_years} relaxation for {normalized_category})"
        if relaxation_years else ""
    )
    reasoning = f"Candidate's age is {age} years (DOB: {dob_str}), allowed range {range_desc}{relaxation_note}."

    return {"result": "pass" if (min_ok and max_ok) else "fail", "reasoning": reasoning}


# ---- Best-effort extraction of base age min/max from the age criterion text ----

def parse_age_range(age_description: str) -> tuple[int | None, int | None]:
    """
    Best-effort attempt to extract a numeric min/max from the free-text age
    criterion. Returns (None, None) if no pattern matches -- in that case
    HR will need to enter it manually via the Criteria Editor, or the raw
    description text will just be shown as-is during screening.
    """
    text = age_description.lower()

    # Pattern: "between 21 years to 30 years" / "not less than 21 and not exceeding 30"
    range_match = re.search(r"(\d{2})\s*(?:years?)?\s*(?:to|and|-)\s*(\d{2})\s*years?", text)
    if range_match:
        return int(range_match.group(1)), int(range_match.group(2))

    # Pattern: "not exceeding 40 years" / "should not be more than 50 years"
    max_match = re.search(r"(?:not exceeding|not more than|not be more than)\s*(\d{2})", text)
    if max_match:
        return None, int(max_match.group(1))

    return None, None


# ---- Structural validation guardrails (for the JD parsing output) ----

def validate_gemini_output(data: dict) -> list[str]:
    """Basic sanity checks on Gemini's output. An empty list means no issues were found."""
    issues = []

    if data.get("post_count", 0) < 1:
        issues.append("post_count is 0 -- there should be at least 1 post")

    posts = data.get("posts", [])
    if len(posts) != data.get("post_count"):
        issues.append(
            f"post_count ({data.get('post_count')}) doesn't match the actual "
            f"posts list length ({len(posts)})"
        )

    seen_titles = set()
    for i, post in enumerate(posts):
        title = post.get("title", "").strip()
        if not title:
            issues.append(f"Post #{i + 1} has an empty title")
        if title in seen_titles:
            issues.append(f"Duplicate title found: '{title}'")
        seen_titles.add(title)
        if not post.get("criteria"):
            issues.append(f"Post '{title}' has no criteria")

    if data.get("confidence") in ("low", "medium"):
        issues.append(
            f"Gemini itself reported '{data.get('confidence')}' confidence: "
            f"{data.get('ambiguity_notes')}"
        )

    age_relax = data.get("age_relaxation")
    if age_relax is None:
        issues.append("The age_relaxation field is missing from the output entirely")
    else:
        mentioned = age_relax.get("mentioned_in_jd")
        rules = age_relax.get("rules", [])
        if mentioned and not rules:
            issues.append(
                "age_relaxation.mentioned_in_jd is true but the rules list is empty"
            )
        if not mentioned and rules:
            issues.append(
                "age_relaxation.mentioned_in_jd is false but the rules list has data in it"
            )

    return issues
