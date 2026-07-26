"""
Small shared helpers for interpreting Gemini's raw criterion output into
DB-ready fields. Used by both the initial JD upload flow (jd_upload.py)
and the criteria restore flow (job_profiles.py), so the same heuristic
is applied consistently in both places.
"""


def is_essential_from_description(description: str, criterion_type: str = "") -> bool:
    """Guesses essential vs desirable/preferred from the wording at the
    start of the description. A small heuristic -- HR can override this
    in the Criteria Editor if it's wrong.

    Skill criteria always default to NON-essential: the skills match is an
    informational percentage that never rejects a candidate unless HR
    explicitly marks it essential and sets a minimum match percentage.
    """
    if criterion_type == "skill":
        return False
    lowered = description.strip().lower()
    return not lowered.startswith(("preferred", "preferable", "desirable"))
