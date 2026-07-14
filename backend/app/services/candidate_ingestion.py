"""
Candidate ingestion service.

Parses the candidate master data file and a master ZIP (containing one
nested ZIP per candidate, named using their Excel "Id." column), matches
each candidate to their Excel row, extracts their documents to persistent
storage, and tags each document using the Excel's own document URL
columns as the source of truth -- rather than guessing from filenames.

This logic was first validated as a standalone script (test_candidate_ingest.py)
against real IHMCL export data before being wired into this service.
"""

import os
import io
import json
import uuid
import zipfile

import pandas as pd

from app.services.age_relaxation import normalize_candidate_category

# Maps a clean internal "document_type" key -> the Excel column name that
# holds the URL to that document.
FIXED_DOCUMENT_COLUMNS = {
    "photograph": "Photograph",
    "signature": "Signature",
    "10th_marksheet": "10th Mark File",
    "graduation_certificate": "Graduation File",
    "salary_slip": "Salary Slip File",
    "resume_cv": "User CV File",
    "pwbd_certificate": "PwBD File",
    "category_certificate": "Category Certi File",
}

# Work File1 .. Work File8 -> experience_proof_1 .. experience_proof_8
WORK_FILE_COLUMNS = {f"experience_proof_{i}": f"Work File{i}" for i in range(1, 9)}

ALL_DOCUMENT_COLUMNS = {**FIXED_DOCUMENT_COLUMNS, **WORK_FILE_COLUMNS}


def load_candidate_master_data(file_path: str) -> pd.DataFrame:
    """
    Loads the candidate master data file.

    Note: despite typically having a .xls extension, IHMCL's export is
    actually a tab-separated plain text file, not a real Excel binary.
    We try the real Excel reader first (in case a future export IS a
    genuine .xls/.xlsx), and fall back to tab-separated parsing.
    """
    try:
        return pd.read_excel(file_path)
    except Exception:
        return pd.read_csv(file_path, sep="\t")


def nested_zip_name_to_candidate_id(zip_filename: str) -> str:
    """'IHM_JA_1900_10001_downloaded_files.zip' -> 'IHM/JA/1900/10001'"""
    base = zip_filename.replace("_downloaded_files.zip", "").replace(".zip", "")
    return base.replace("_", "/", 3)


def extract_filename_from_url(url) -> str | None:
    """Gets just the filename from a full document URL. Returns None for
    empty/N/A values."""
    if pd.isna(url):
        return None
    url_str = str(url).strip()
    if url_str in ("", "N/a", "n/a", "NA", "nan"):
        return None
    return url_str.rstrip("/").split("/")[-1]


def match_candidate_documents(candidate_row: pd.Series, candidate_files_dir: str) -> dict:
    """
    For a single candidate, matches each expected document type to an
    actual file found on disk (inside their extracted folder).
    """
    files_on_disk = {}
    for fname in os.listdir(candidate_files_dir):
        full_path = os.path.join(candidate_files_dir, fname)
        if os.path.isfile(full_path):
            files_on_disk[fname.lower()] = full_path

    matched = {}
    expected_but_missing = []

    for doc_type, column_name in ALL_DOCUMENT_COLUMNS.items():
        if column_name not in candidate_row:
            continue
        expected_filename = extract_filename_from_url(candidate_row[column_name])
        if expected_filename is None:
            continue  # Excel says this document doesn't apply to this candidate

        match = files_on_disk.get(expected_filename.lower())
        if match:
            matched[doc_type] = match
            files_on_disk.pop(expected_filename.lower(), None)
        else:
            expected_but_missing.append(doc_type)

    return {"matched": matched, "expected_but_missing": expected_but_missing}


def _row_to_json_safe_dict(row: pd.Series) -> dict:
    """
    Converts a pandas row into a plain, JSON-serializable dict.

    Using row.to_json() and re-parsing is a simple, reliable way to get
    rid of pandas/numpy-specific types (Timestamps, int64, NaN) that the
    database's JSON column wouldn't otherwise accept directly.
    """
    return json.loads(row.to_json())


def process_master_zip(df: pd.DataFrame, master_zip_path: str, storage_dir: str) -> list[dict]:
    """
    Walks through every nested candidate ZIP inside the master ZIP,
    matches it to an Excel row, extracts + matches its documents to
    persistent storage.

    Returns a list of per-candidate result dicts, ready to be turned into
    Candidate + CandidateDocument database rows by the calling router.
    """
    results = []
    os.makedirs(storage_dir, exist_ok=True)

    with zipfile.ZipFile(master_zip_path) as master_zf:
        nested_zip_names = [n for n in master_zf.namelist() if n.lower().endswith(".zip")]

        for nested_name in nested_zip_names:
            candidate_id = nested_zip_name_to_candidate_id(os.path.basename(nested_name))

            matching_rows = df[df["Id."] == candidate_id]
            if matching_rows.empty:
                # We know a candidate ZIP exists, but have no Excel data
                # for them at all -- still record this so it's visible
                # during review, rather than silently dropping it.
                results.append({
                    "external_id": candidate_id,
                    "ingestion_status": "excel_row_not_found",
                })
                continue
            candidate_row = matching_rows.iloc[0]

            candidate_dir = os.path.join(storage_dir, str(uuid.uuid4()))
            os.makedirs(candidate_dir, exist_ok=True)

            try:
                nested_bytes = master_zf.read(nested_name)
                with zipfile.ZipFile(io.BytesIO(nested_bytes)) as nested_zf:
                    nested_zf.extractall(candidate_dir)
            except zipfile.BadZipFile:
                results.append({
                    "external_id": candidate_id,
                    "name": candidate_row.get("Name"),
                    "ingestion_status": "corrupt_zip",
                })
                continue

            doc_result = match_candidate_documents(candidate_row, candidate_dir)

            if doc_result["matched"] and not doc_result["expected_but_missing"]:
                ingestion_status = "documents_complete"
            elif doc_result["matched"]:
                ingestion_status = "documents_incomplete"
            else:
                ingestion_status = "no_documents_found"

            raw_category = candidate_row.get("Category")
            phone = candidate_row.get("Phone")
            dob = candidate_row.get("DOB")

            results.append({
                "external_id": candidate_id,
                "name": candidate_row.get("Name"),
                "email": candidate_row.get("Email"),
                "phone": str(phone) if pd.notna(phone) else None,
                "dob": str(dob) if pd.notna(dob) else None,
                "gender": candidate_row.get("Gender"),
                "raw_category": raw_category if pd.notna(raw_category) else None,
                "normalized_category": normalize_candidate_category(raw_category),
                "raw_excel_data": _row_to_json_safe_dict(candidate_row),
                "ingestion_status": ingestion_status,
                "matched_documents": doc_result["matched"],  # {doc_type: local_file_path}
                "expected_but_missing": doc_result["expected_but_missing"],
            })

    return results
