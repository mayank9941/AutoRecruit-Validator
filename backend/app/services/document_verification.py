"""
Document verification service.

For candidates who passed screening ("eligible"), this re-extracts
identity details (name, date of birth) from a reliable source document --
the 10th standard marksheet/certificate -- and compares them against what
the candidate declared in their application form (captured in the Excel
data at ingestion time). Any mismatch or low-confidence extraction is
flagged so HR can manually verify or reject it, with notes.

Many real-world marksheets/certificates are scanned images rather than
text-based PDFs (no text embedded at all). To handle this, if a document
has little or no extractable text, its first page is rendered to an image
and sent directly to Gemini's vision capability instead -- rather than
just failing on every scanned document.
"""

import os

import pdfplumber

from app.models.candidate import Candidate
from app.models.document_verification import DocumentVerification
from app.services.gemini_service import (
    extract_identity_fields_with_gemini,
    extract_identity_fields_from_image_with_gemini,
)
from app.services.age_relaxation import parse_date_flexible

SOURCE_DOCUMENT_TYPE = "10th_marksheet"

# Below this many extracted characters, a PDF page is treated as "no
# usable embedded text" (e.g. a scanned image with no OCR layer) rather
# than a genuinely empty/blank document -- and the image-based fallback
# is used instead.
MIN_TEXT_LENGTH_THRESHOLD = 20


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split()) if value else ""


def _dates_are_equal(value_a: str, value_b: str) -> bool:
    """Checks whether two date strings (possibly in different formats)
    represent the same calendar date."""
    date_a = parse_date_flexible(str(value_a))
    date_b = parse_date_flexible(str(value_b))
    if date_a is not None and date_b is not None:
        return date_a == date_b
    # If either couldn't be parsed as a date, fall back to a plain text
    # comparison (won't catch format differences, but avoids crashing).
    return _normalize_text(str(value_a)) == _normalize_text(str(value_b))


def _extract_text_from_pdf(file_path: str) -> str:
    if not file_path.lower().endswith(".pdf") or not os.path.exists(file_path):
        return ""
    text_parts = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
    except Exception:
        return ""
    return "\n".join(text_parts)


def _render_first_page_as_image(file_path: str) -> bytes | None:
    """
    Renders the first page of a PDF to a PNG image, for documents that
    have no usable embedded text (scanned images). Uses PyMuPDF, which
    bundles its own rendering engine (no external Poppler/ImageMagick
    install required).
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        print(f"[document_verification] PyMuPDF ('pymupdf' package) is not installed -- "
              f"cannot render scanned pages to images. Run: pip install pymupdf. Error: {e}")
        return None

    try:
        doc = fitz.open(file_path)
        if doc.page_count == 0:
            return None
        page = doc[0]
        pixmap = page.get_pixmap(dpi=200)
        return pixmap.tobytes("png")
    except Exception as e:
        print(f"[document_verification] Failed to render '{file_path}' to an image: {type(e).__name__}: {e}")
        return None


def _record_extraction_failed(candidate: Candidate) -> list[DocumentVerification]:
    return [DocumentVerification(
        candidate_id=candidate.id,
        field_name="name",
        source_document_type=SOURCE_DOCUMENT_TYPE,
        form_value=candidate.name,
        extracted_value=None,
        extraction_confidence=None,
        match_status="extraction_failed",
    )]


def _compare_field(form_value, extracted_value, confidence: str, is_date: bool = False) -> str:
    """Returns 'matched' / 'mismatch' / 'low_confidence' / 'extraction_failed'."""
    if not extracted_value:
        return "extraction_failed"
    if confidence == "low":
        return "low_confidence"
    if not form_value:
        return "low_confidence"  # nothing on file to compare against

    if is_date:
        return "matched" if _dates_are_equal(form_value, extracted_value) else "mismatch"
    return "matched" if _normalize_text(str(form_value)) == _normalize_text(str(extracted_value)) else "mismatch"


def verify_candidate_identity(db, candidate: Candidate) -> list[DocumentVerification]:
    """
    Runs identity verification for one candidate against their 10th
    marksheet. Creates one DocumentVerification row per field checked
    (name, date_of_birth) and returns them.

    Tries text extraction first; if the document has no usable embedded
    text (a scanned image), falls back to sending the rendered page image
    directly to Gemini's vision capability.
    """
    source_doc = next(
        (d for d in candidate.documents if d.document_type == SOURCE_DOCUMENT_TYPE), None
    )
    if source_doc is None:
        result = _record_extraction_failed(candidate)
        for v in result:
            db.add(v)
        return result

    document_text = _extract_text_from_pdf(source_doc.file_path)

    if len(document_text.strip()) >= MIN_TEXT_LENGTH_THRESHOLD:
        extracted = extract_identity_fields_with_gemini(document_text)
    else:
        # Likely a scanned image with no embedded text -- render the page
        # and send it to Gemini's vision capability instead.
        image_bytes = _render_first_page_as_image(source_doc.file_path)
        if image_bytes is None:
            result = _record_extraction_failed(candidate)
            for v in result:
                db.add(v)
            return result
        extracted = extract_identity_fields_from_image_with_gemini(image_bytes)

    confidence = extracted.get("confidence")
    created: list[DocumentVerification] = []

    name_status = _compare_field(candidate.name, extracted.get("name"), confidence)
    created.append(DocumentVerification(
        candidate_id=candidate.id,
        field_name="name",
        source_document_type=SOURCE_DOCUMENT_TYPE,
        form_value=candidate.name,
        extracted_value=extracted.get("name"),
        extraction_confidence=confidence,
        match_status=name_status,
    ))

    dob_status = _compare_field(candidate.dob, extracted.get("date_of_birth"), confidence, is_date=True)
    created.append(DocumentVerification(
        candidate_id=candidate.id,
        field_name="date_of_birth",
        source_document_type=SOURCE_DOCUMENT_TYPE,
        form_value=candidate.dob,
        extracted_value=extracted.get("date_of_birth"),
        extraction_confidence=confidence,
        match_status=dob_status,
    ))

    for v in created:
        db.add(v)

    return created
