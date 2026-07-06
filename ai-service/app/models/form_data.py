"""
Pydantic models for structured form data.

Per SKILL.md §6: applications.parsed_form_data is JSONB containing declared values.
Per PRD v3 FR-06: fields map to the form PDF's sections.
"""

from typing import Optional
from pydantic import BaseModel, Field


class PersonalInfo(BaseModel):
    """Personal information from the application form."""

    name: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    category: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class EducationEntry(BaseModel):
    """A single education qualification entry."""

    qualification: Optional[str] = None
    institution: Optional[str] = None
    board_university: Optional[str] = None
    year_of_passing: Optional[int] = None
    percentage_or_cgpa: Optional[str] = None
    division: Optional[str] = None
    subject: Optional[str] = None


class WorkExperienceEntry(BaseModel):
    """A single work experience entry."""

    organization: Optional[str] = None
    designation: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    duration_years: Optional[float] = None
    nature_of_work: Optional[str] = None
    pay_scale: Optional[str] = None


class TechnicalSkillEntry(BaseModel):
    """A single technical skill or certification."""

    skill_name: Optional[str] = None
    certification: Optional[str] = None
    proficiency_level: Optional[str] = None


class CompensationInfo(BaseModel):
    """Current and expected compensation."""

    current_ctc: Optional[str] = None
    expected_ctc: Optional[str] = None
    notice_period: Optional[str] = None


class AttachmentEntry(BaseModel):
    """An entry from the form's 'List of attached documents' table."""

    document_type: str = Field(description="Type of document (e.g., 'Degree Certificate')")
    file_name: Optional[str] = Field(default=None, description="Name of the file in the ZIP")
    is_present: Optional[bool] = Field(default=None, description="Whether the file is actually in the ZIP")


class ParsedFormData(BaseModel):
    """
    Complete parsed form data from a candidate's application PDF.

    Per SKILL.md §6: stored in applications.parsed_form_data as JSONB.
    Per PRD v3 FR-06: deterministic table extraction, not LLM reading.
    """

    personal_info: Optional[PersonalInfo] = None
    education: list[EducationEntry] = Field(default_factory=list)
    work_experience: list[WorkExperienceEntry] = Field(default_factory=list)
    technical_skills: list[TechnicalSkillEntry] = Field(default_factory=list)
    compensation: Optional[CompensationInfo] = None
    reference_number: Optional[str] = None
    parsing_warnings: list[str] = Field(
        default_factory=list,
        description="Fields that could not be confidently parsed",
    )


class AttachmentManifest(BaseModel):
    """
    The attachment manifest from the form's own 'List of attached documents' table.

    Per SKILL.md §6: stored in applications.attachment_manifest as JSONB.
    Per SKILL.md §8: used to target evidence lookup to the correct file.
    """

    attachments: list[AttachmentEntry] = Field(default_factory=list)
    parsing_warnings: list[str] = Field(default_factory=list)


class FormParseRequest(BaseModel):
    """Request to parse a structured application form PDF."""

    pdf_s3_key: str = Field(description="S3 key of the form PDF")
    reference_number: str = Field(description="Expected reference number for validation")


class FormParseResponse(BaseModel):
    """Response containing parsed form data and attachment manifest."""

    parsed_form_data: ParsedFormData
    attachment_manifest: AttachmentManifest
    template_version: Optional[str] = Field(
        default=None,
        description="Detected form template version",
    )
