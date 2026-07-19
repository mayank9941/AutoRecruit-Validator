"""
Small shared helpers for interpreting Gemini's raw criterion output into
DB-ready fields. Used by both the initial JD upload flow (jd_upload.py)
and the criteria restore flow (job_profiles.py), so the same heuristic
is applied consistently in both places.
"""


def is_essential_from_description(description: str) -> bool:
    """Guesses essential vs desirable/preferred from the wording at the
    start of the description. A small heuristic -- HR can override this
    in the Criteria Editor if it's wrong."""
    lowered = description.strip().lower()
    return not lowered.startswith(("preferred", "preferable", "desirable"))
