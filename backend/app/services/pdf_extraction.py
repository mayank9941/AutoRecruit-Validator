"""
Service for extracting raw text from a PDF.
"""

import pdfplumber


def extract_text_from_pdf(pdf_path: str) -> str:
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(_clean_pdf_text(page_text))
    return "\n".join(text_parts)


MARKER_PREFIX = "--- DOCUMENT:"

# A page with fewer real characters than this is treated as a scanned image
# (no usable text layer) and becomes a candidate for the OCR fallback.
OCR_MIN_PAGE_CHARS = 40

# A document whose full extracted text (markers excluded) has fewer real
# characters than this is considered "not meaningfully extracted" -- e.g. a
# scanned marksheet where pdfplumber returned nothing but page markers.
MEANINGFUL_DOC_CHARS = 100

# Cost guard: at most this many pages per document go through Gemini-vision
# OCR (marksheets/certificates/letters are 1-3 pages; anything longer with
# no text layer is unusual).
MAX_OCR_PAGES_PER_DOC = 5


def _clean_pdf_text(text: str) -> str:
    """Broken PDF encoders sometimes emit NUL (0x00) bytes in the text
    layer -- PostgreSQL TEXT columns reject strings containing them, which
    made caching (and therefore screening) fail for affected candidates."""
    return text.replace("\x00", "")


def _marked_page(display_name: str, page_num: int, text: str) -> str:
    return f"--- DOCUMENT: {display_name} | PAGE: {page_num} ---\n{_clean_pdf_text(text)}\n"


def pdf_text_is_meaningful(marked_text: str) -> bool:
    """
    True when a cached extraction actually contains document content, not
    just the page markers -- scanned PDFs extracted before the OCR fallback
    existed cached marker-only text, and those need re-extraction.
    """
    content = "\n".join(
        line for line in marked_text.splitlines() if not line.startswith(MARKER_PREFIX)
    )
    return len(content.strip()) >= MEANINGFUL_DOC_CHARS


def extract_marked_pdf_text(pdf_path: str, display_name: str) -> str:
    """
    Extracts a PDF's text with a DOCUMENT/PAGE marker around every page --
    the exact format criterion evaluation feeds to Gemini so it can cite
    where it found something. Text layer only, no OCR -- used at ingestion
    time where speed matters; scanned documents are deferred to
    extract_marked_pdf_text_with_ocr() during screening.
    """
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""
            parts.append(_marked_page(display_name, page_num, page_text))
    return "\n".join(parts)


def extract_marked_pdf_text_with_ocr(pdf_path: str, display_name: str) -> str:
    """
    Like extract_marked_pdf_text(), but pages with no usable text layer
    (scanned marksheets, photographed certificates) are rendered to an
    image and transcribed via Gemini vision, so screening can actually
    read them. The caller caches the result on CandidateDocument, so each
    scanned page is OCR'd once, ever.
    """
    import fitz  # pymupdf -- imported lazily; only needed on the OCR path

    from app.services.gemini_service import transcribe_document_image_with_gemini

    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    parts = []
    ocr_budget = MAX_OCR_PAGES_PER_DOC
    rendered_pdf = None
    try:
        for page_num, page_text in enumerate(page_texts, start=1):
            if len(page_text.strip()) < OCR_MIN_PAGE_CHARS and ocr_budget > 0:
                ocr_budget -= 1
                try:
                    if rendered_pdf is None:
                        rendered_pdf = fitz.open(pdf_path)
                    # 2x zoom -- enough resolution for Gemini to read small
                    # marksheet tables without producing a huge image.
                    pixmap = rendered_pdf[page_num - 1].get_pixmap(matrix=fitz.Matrix(2, 2))
                    transcript = transcribe_document_image_with_gemini(pixmap.tobytes("png"))
                    if transcript and transcript != "[no readable text]":
                        page_text = transcript
                    elif not page_text.strip():
                        page_text = "[scanned page -- no readable text]"
                except Exception:
                    if not page_text.strip():
                        page_text = "[scanned page -- text could not be extracted]"
            parts.append(_marked_page(display_name, page_num, page_text))
    finally:
        if rendered_pdf is not None:
            rendered_pdf.close()

    return "\n".join(parts)
