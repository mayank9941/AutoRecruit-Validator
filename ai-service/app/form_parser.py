"""
Deterministic form parser for standardized PDF applications.
Per SKILL.md §6: deterministic table extraction, not LLM reading.

Uses pdfplumber for tabular data extraction from structured government
application form PDFs. Falls back gracefully when pdfplumber is unavailable.
"""

import structlog
import io
from typing import Tuple, Optional
from app.models.form_data import (
    ParsedFormData,
    AttachmentManifest,
    PersonalInfo,
    EducationEntry,
    WorkExperienceEntry,
    AttachmentEntry,
)

logger = structlog.get_logger(__name__)


def _try_import_pdfplumber():
    """Lazy import pdfplumber to avoid hard dependency during tests."""
    try:
        import pdfplumber
        return pdfplumber
    except ImportError:
        logger.warning("pdfplumber_not_installed", message="Install pdfplumber for PDF parsing")
        return None


def _extract_tables_from_pdf(pdf_bytes: bytes) -> list:
    """Extract all tables from a PDF file using pdfplumber."""
    pdfplumber = _try_import_pdfplumber()
    if pdfplumber is None:
        return []

    tables = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            page_tables = page.extract_tables()
            for table in page_tables:
                tables.append({"page": page_num, "data": table})
    return tables


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract full text from a PDF for fallback parsing."""
    pdfplumber = _try_import_pdfplumber()
    if pdfplumber is None:
        return ""

    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    return "\n".join(text_parts)


def _detect_template_version(text: str) -> str:
    """Detect the form template version from text markers."""
    version_markers = {
        "v2.0": ["Form Version 2.0", "APPLICATION FORM V2"],
        "v1.1": ["Form Version 1.1", "REVISED APPLICATION"],
        "v1.0": ["APPLICATION FORM", "FORM OF APPLICATION"],
    }
    text_upper = text.upper()
    for version, markers in version_markers.items():
        for marker in markers:
            if marker.upper() in text_upper:
                return version
    return "v1.0"


def _parse_personal_info_table(table_data: list) -> PersonalInfo:
    """Parse personal info from a key-value table layout."""
    info = {}
    for row in table_data:
        if not row or len(row) < 2:
            continue
        key = (row[0] or "").strip().lower()
        value = (row[1] or "").strip() if len(row) > 1 else None

        if not key or not value:
            continue

        if "name" in key and "father" in key:
            info["father_name"] = value
        elif "name" in key and "mother" in key:
            info["mother_name"] = value
        elif "name" in key:
            info["name"] = value
        elif "date" in key and "birth" in key:
            info["date_of_birth"] = value
        elif "age" in key:
            try:
                info["age"] = int(value.split()[0])
            except (ValueError, IndexError):
                pass
        elif "gender" in key or "sex" in key:
            info["gender"] = value
        elif "nationality" in key:
            info["nationality"] = value
        elif "category" in key or "caste" in key:
            info["category"] = value
        elif "marital" in key:
            info["marital_status"] = value
        elif "address" in key:
            info["address"] = value
        elif "phone" in key or "mobile" in key or "contact" in key:
            info["phone"] = value
        elif "email" in key or "e-mail" in key:
            info["email"] = value

    return PersonalInfo(**info) if info else PersonalInfo()


def _parse_education_table(table_data: list) -> list[EducationEntry]:
    """Parse education entries from a tabular layout."""
    entries = []
    if not table_data or len(table_data) < 2:
        return entries

    # First row is headers, remaining are data
    headers = [str(h or "").strip().lower() for h in table_data[0]]

    for row in table_data[1:]:
        if not row or all(not cell for cell in row):
            continue
        entry_data = {}
        for i, cell in enumerate(row):
            if i >= len(headers):
                break
            value = str(cell or "").strip()
            if not value:
                continue
            header = headers[i]
            if "qualification" in header or "exam" in header or "degree" in header:
                entry_data["qualification"] = value
            elif "institution" in header or "school" in header or "college" in header:
                entry_data["institution"] = value
            elif "board" in header or "university" in header:
                entry_data["board_university"] = value
            elif "year" in header or "passing" in header:
                try:
                    entry_data["year_of_passing"] = int(value)
                except ValueError:
                    pass
            elif "percentage" in header or "cgpa" in header or "marks" in header:
                entry_data["percentage_or_cgpa"] = value
            elif "division" in header or "class" in header:
                entry_data["division"] = value
            elif "subject" in header:
                entry_data["subject"] = value

        if entry_data:
            entries.append(EducationEntry(**entry_data))

    return entries


def _parse_experience_table(table_data: list) -> list[WorkExperienceEntry]:
    """Parse work experience entries from a tabular layout."""
    entries = []
    if not table_data or len(table_data) < 2:
        return entries

    headers = [str(h or "").strip().lower() for h in table_data[0]]

    for row in table_data[1:]:
        if not row or all(not cell for cell in row):
            continue
        entry_data = {}
        for i, cell in enumerate(row):
            if i >= len(headers):
                break
            value = str(cell or "").strip()
            if not value:
                continue
            header = headers[i]
            if "organization" in header or "employer" in header or "company" in header:
                entry_data["organization"] = value
            elif "designation" in header or "post" in header or "position" in header:
                entry_data["designation"] = value
            elif "from" in header:
                entry_data["from_date"] = value
            elif "to" in header:
                entry_data["to_date"] = value
            elif "duration" in header or "year" in header:
                try:
                    entry_data["duration_years"] = float(value)
                except ValueError:
                    pass
            elif "nature" in header or "duties" in header:
                entry_data["nature_of_work"] = value
            elif "pay" in header or "scale" in header or "salary" in header:
                entry_data["pay_scale"] = value

        if entry_data:
            entries.append(WorkExperienceEntry(**entry_data))

    return entries


def _parse_attachment_table(table_data: list) -> list[AttachmentEntry]:
    """Parse attachment manifest from the 'List of Enclosed Documents' table."""
    entries = []
    if not table_data or len(table_data) < 2:
        return entries

    for row in table_data[1:]:
        if not row or all(not cell for cell in row):
            continue
        doc_type = str(row[0] or "").strip() if len(row) > 0 else ""
        file_name = str(row[1] or "").strip() if len(row) > 1 else None
        if doc_type:
            entries.append(AttachmentEntry(
                document_type=doc_type,
                file_name=file_name if file_name else None,
                is_present=None,  # Will be verified during ZIP extraction
            ))

    return entries


def _classify_table(table_data: list) -> str:
    """Classify a table by inspecting its headers/content."""
    if not table_data or not table_data[0]:
        return "unknown"

    header_text = " ".join(str(h or "") for h in table_data[0]).lower()

    if any(kw in header_text for kw in ["name", "father", "date of birth", "gender", "address"]):
        return "personal_info"
    if any(kw in header_text for kw in ["qualification", "degree", "university", "board", "examination"]):
        return "education"
    if any(kw in header_text for kw in ["organization", "employer", "designation", "experience"]):
        return "experience"
    if any(kw in header_text for kw in ["document", "enclosed", "attachment", "certificate"]):
        return "attachments"

    return "unknown"


async def parse_application_form(
    pdf_s3_key: str, expected_reference: str, pdf_bytes: Optional[bytes] = None
) -> Tuple[ParsedFormData, AttachmentManifest, str]:
    """
    Parse a standardized application form PDF.

    Uses pdfplumber for deterministic table extraction. The function:
    1. Extracts all tables from the PDF
    2. Classifies each table by content
    3. Parses fields into structured Pydantic models
    4. Detects the template version

    Args:
        pdf_s3_key: The S3 key to the PDF file
        expected_reference: The expected reference number for validation
        pdf_bytes: Optional raw PDF bytes (if already downloaded)

    Returns:
        Tuple containing (ParsedFormData, AttachmentManifest, template_version)
    """
    logger.info(
        "parsing_form_pdf",
        pdf_s3_key=pdf_s3_key,
        expected_reference=expected_reference,
    )

    warnings = []
    personal_info = PersonalInfo()
    education = []
    experience = []
    attachments = []
    template_version = "v1.0"

    if pdf_bytes is None:
        # In production, download from S3 here.
        # For now, return a stub with a warning.
        warnings.append("PDF bytes not provided — returning stub data. Wire up S3 download.")
        parsed_data = ParsedFormData(
            reference_number=expected_reference,
            parsing_warnings=warnings,
        )
        manifest = AttachmentManifest(parsing_warnings=["No PDF bytes provided"])
        return parsed_data, manifest, template_version

    # Extract tables
    tables = _extract_tables_from_pdf(pdf_bytes)
    full_text = _extract_text_from_pdf(pdf_bytes)
    template_version = _detect_template_version(full_text)

    if not tables:
        warnings.append("No tables found in PDF — form may be non-standard or image-based")

    # Classify and parse each table
    for table_info in tables:
        table_data = table_info["data"]
        table_type = _classify_table(table_data)

        if table_type == "personal_info":
            personal_info = _parse_personal_info_table(table_data)
        elif table_type == "education":
            education = _parse_education_table(table_data)
        elif table_type == "experience":
            experience = _parse_experience_table(table_data)
        elif table_type == "attachments":
            attachments = _parse_attachment_table(table_data)

    parsed_data = ParsedFormData(
        personal_info=personal_info,
        education=education,
        work_experience=experience,
        reference_number=expected_reference,
        parsing_warnings=warnings,
    )

    manifest = AttachmentManifest(
        attachments=attachments,
        parsing_warnings=[],
    )

    logger.info(
        "form_parsed",
        pdf_s3_key=pdf_s3_key,
        tables_found=len(tables),
        education_entries=len(education),
        experience_entries=len(experience),
        attachment_entries=len(attachments),
        template_version=template_version,
    )

    return parsed_data, manifest, template_version
