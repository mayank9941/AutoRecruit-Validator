# IHMCL HR Screening System -- Backend

FastAPI + PostgreSQL backend for the IHMCL HR Screening System. Covers the
full flow from JD upload through candidate screening: **Login -> Upload JD
(auto-creates Job Profiles) -> Edit Criteria -> Upload Candidates -> Screen
(single or batch) -> Results**.

## Setup

**Every teammate running this backend needs to complete all of these
steps on their own machine** -- each person has their own PostgreSQL
install (with their own password), their own Gemini API key, and their
own `.env` file. Nothing is shared between teammates except the code
itself.

### 1. Create the PostgreSQL database
```bash
# Postgres must already be installed
createdb ihmcl_hr
```

### 2. Install Python dependencies
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt
```

### 3. Create your own `.env` file
```bash
cp .env.example .env
```
Open `.env` and fill in:
- `DATABASE_URL` -- use **your own** Postgres password (the one you set when you installed Postgres on your machine -- this is almost never the same for two different people, so don't copy a teammate's value)
- `GEMINI_API_KEY` -- your own key from Google AI Studio
- `SECRET_KEY` -- any random string, doesn't need to match anyone else's

**This is the key fix for "it works on my laptop but not my teammates'."**
The app automatically loads `.env` on startup (via `python-dotenv`), so once
this file is set up correctly, it stays working across every new terminal
session, every reboot, forever -- no more manually running `set VAR=value`
commands (which is easy to forget, and was the actual cause of most
"password authentication failed" / login errors teammates were hitting).

`.env` is already in `.gitignore` -- **never commit it or share it**, since
it contains your personal password and API key.

### 4. Run the server
```bash
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs` in your browser -- this is FastAPI's
automatic interactive documentation (Swagger UI), where you can test every
endpoint without building a frontend.

### 5. Create the first HR account (command line)

There's no open signup endpoint by design (HR accounts should be
provisioned by an admin, not self-registered):

```bash
python scripts/create_hr_user.py hr@ihmcl.com
```
This will prompt for a password and create an HR account in the database.
(This script also reads your `.env` automatically -- no separate setup
needed.)

### 6. Log in via `/docs`

Call `POST /auth/login` from Swagger UI with your email/password -- the
browser will automatically store the session cookie, and all other
protected endpoints will then work directly from `/docs` too.

## ⚠️ Troubleshooting: "it works on my laptop but not my teammate's"

This almost always comes down to one of these -- check in order:

1. **Did they create their own `.env` file?** (`cp .env.example .env`, then
   actually fill in their own Postgres password and Gemini API key). If
   `.env` doesn't exist, the app silently falls back to a default
   `DATABASE_URL` that assumes the Postgres password is literally
   `postgres` -- which fails for almost everyone with a real password set.
2. **Is their Postgres password actually in `.env`?** Not yours, not a
   placeholder -- their own, from when they installed Postgres on their
   own machine.
3. **Did they create the `ihmcl_hr` database** on their own Postgres
   install? (`createdb ihmcl_hr`) -- a fresh Postgres install doesn't have
   it yet.
4. **Did they create their own HR account** with
   `python scripts/create_hr_user.py ...`? Each person's database starts
   empty -- there's no shared user list.
5. **Did they run `pip install -r requirements.txt`** inside their own
   virtual environment? Missing packages (especially after a
   `requirements.txt` update, like `pymupdf` or `python-dotenv`) cause
   confusing errors that look unrelated to the real cause.

## ⚠️ If you already have a database from an earlier version

Several tables have been added/changed since the first version of this
backend. Since `Base.metadata.create_all()` only creates tables that don't
exist yet (it doesn't alter existing ones), you'll need to reset the
schema when it changes.

**Easiest fix during development** (since this is still test data, not
production data): drop all tables and let them be recreated fresh.

Open the `ihmcl_hr` database in pgAdmin, run this in the Query Tool:
```sql
DROP TABLE IF EXISTS document_verifications CASCADE;
DROP TABLE IF EXISTS screening_runs CASCADE;
DROP TABLE IF EXISTS criterion_evaluations CASCADE;
DROP TABLE IF EXISTS candidate_documents CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS age_relaxation_rules CASCADE;
DROP TABLE IF EXISTS criteria CASCADE;
DROP TABLE IF EXISTS job_profiles CASCADE;
DROP TABLE IF EXISTS jd_uploads CASCADE;
DROP TABLE IF EXISTS hr_users CASCADE;
```
Then restart the server (`uvicorn app.main:app --reload`) -- it will
recreate all tables with the current structure.

**For just this update** (adding `source_post_index` to `job_profiles` and
`source_index` to `criteria`, for the criteria-restore feature): since
these are new *nullable* columns being added to existing tables, you can
skip the full drop-and-recreate above and instead just run this in the
Query Tool, which preserves all your existing candidates/screening data:
```sql
ALTER TABLE job_profiles ADD COLUMN IF NOT EXISTS source_post_index INTEGER;
ALTER TABLE criteria ADD COLUMN IF NOT EXISTS source_index INTEGER;
```
Existing profiles/criteria (created before this update) will have `NULL`
in these new columns, which means criteria-restore won't work for them
specifically (they'll get a 422 explaining why) -- but every JD uploaded
*after* this update will have full restore support.

(Once this goes to production with real data, tables won't be dropped like
this -- schema changes will be applied properly with Alembic migrations,
without losing data. This drop-and-recreate approach is just a development
shortcut for now.)

## API Reference

### Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Log in with email + password; sets a long-lived signed cookie (30 days) |
| POST | `/auth/logout` | Clears the session cookie |
| GET | `/auth/me` | Check who is currently logged in |

### JD Upload
| Method | Path | Purpose |
|---|---|---|
| POST | `/jd/upload` | Upload a JD PDF -- extracts text, parses via Gemini, auto-creates one Job Profile per detected post |

**How it works:**
1. Extracts text from the uploaded PDF
2. Sends it to Gemini for structured extraction (posts, criteria, age relaxation table)
3. Runs rule-based validation guardrails on Gemini's output (empty criteria, duplicate titles, etc.)
4. Duplicate detection via file hash -- re-uploading the exact same file returns the existing profiles instead of creating duplicates
5. Creates a `JobProfile` (+ its `Criterion`s and `AgeRelaxationRule`s) for each detected post

### Job Profiles + Criteria Editor
| Method | Path | Purpose |
|---|---|---|
| GET | `/jd/profiles` | List all active Job Profiles |
| GET | `/jd/profiles/{profile_id}` | Full detail for one profile (criteria + age relaxation rules) |
| POST | `/jd/profiles/{profile_id}/criteria` | Manually add a new criterion |
| PATCH | `/jd/profiles/{profile_id}/criteria/{criterion_id}` | Edit a criterion (partial update -- only send the fields you want to change) |
| DELETE | `/jd/profiles/{profile_id}/criteria/{criterion_id}` | Delete a criterion |
| POST | `/jd/profiles/{profile_id}/criteria/restore` | Re-create any criteria that were deleted, from the original Gemini parse |
| POST | `/jd/profiles/{profile_id}/criteria/{criterion_id}/revert` | Reset one still-present criterion back to its original wording, undoing an HR edit |

**Auto soft-delete on last criterion removal:** if deleting a criterion leaves a profile with zero criteria, the profile itself is automatically soft-deleted (`is_active = False`) -- a profile with no criteria has nothing to screen candidates against, so it's removed from the active `GET /jd/profiles` list (the row itself is kept, not hard-deleted, since candidates may already reference it). Adding a criterion back to a soft-deleted profile via `POST .../criteria` automatically reactivates it.

**Criteria restore vs. revert -- two different operations:**
- **Restore** (`POST .../criteria/restore`) re-creates criteria that were *deleted*. It never touches a criterion that's still present, even if HR has edited it -- doing so would risk creating a duplicate alongside the edited version.
- **Revert** (`POST .../criteria/{criterion_id}/revert`) is the other case: a criterion that's still present but has been *edited*, where HR wants to undo the edit and get the original Gemini wording back. This overwrites the existing row in place rather than creating a new one.

Both rely on each `Criterion`/`JobProfile` tracking the index it was created from in the JD upload's stored Gemini response (`source_index` / `source_post_index`) -- no new Gemini call is made for either operation, since the original parse is already saved. Criteria HR added manually have no source index, so restore always skips them and revert returns a 422 for them (nothing to revert to). This only works for profiles created after this tracking was added -- older profiles will get a 422 explaining that no source data is available.

### Candidate Upload
| Method | Path | Purpose |
|---|---|---|
| POST | `/jd/profiles/{profile_id}/candidates/upload` | Upload the candidate master data file + a master ZIP |
| GET | `/jd/profiles/{profile_id}/candidates` | List candidates uploaded for a profile |

**Expected inputs:**
- `excel_file` -- candidate master data (IHMCL export; despite the `.xls` name, this is actually a tab-separated text file -- the parser handles both formats)
- `master_zip_file` -- a ZIP containing one nested ZIP per candidate, named like `IHM_JA_1900_10001_downloaded_files.zip` (matches the candidate's Excel `Id.` column)

**How it works:**
1. Derives each candidate's `Id.` from their nested ZIP's filename
2. Looks up the matching row in the Excel data
3. Uses the Excel's own document URL columns (Photograph, 10th Mark File, Graduation File, etc.) to get the **exact filename** for each expected document, then looks for that exact file inside the nested ZIP -- this reliably identifies each document's type without guessing from the filename
4. Tracks each candidate's `ingestion_status` (`documents_complete` / `documents_incomplete` / `no_documents_found` / `corrupt_zip` / `excel_row_not_found`) so candidates with missing documents can be cleanly skipped during screening instead of failing

### Screening / Evaluation
| Method | Path | Purpose |
|---|---|---|
| POST | `/jd/profiles/{profile_id}/candidates/{candidate_id}/evaluate` | Evaluate one candidate against all of a profile's criteria |
| POST | `/jd/profiles/{profile_id}/screen` | Start screening all pending candidates for a profile in the background |
| GET | `/jd/profiles/{profile_id}/screening-runs/{run_id}` | Poll for live batch progress |

**How single-candidate evaluation works:**
1. If the candidate's `ingestion_status` isn't `documents_complete` (missing/incomplete/corrupt documents), evaluation is **skipped** entirely -- no Gemini call is wasted, and the candidate stays `not_evaluated`
2. Each criterion is evaluated one at a time:
   - **`age` type criteria** -- purely rule-based (candidate's DOB + the profile's base age range + relaxation rules), never sent to Gemini
   - **All other types** (education/experience/skill/other) -- sent to Gemini, with a citation (document + page) attached to the result
3. Each criterion's result is saved to the `CriterionEvaluation` table
4. The final bucket is computed from **essential** criteria only: any essential fails -> `not_eligible`; no essential fails but at least one is `needs_review` -> `needs_review`; all essential pass -> `eligible`

**⚠️ Known limitation:** age evaluation currently uses "today's date" as the cutoff (`date.today()`), not the JD's actual "closing date of advertisement" -- because JD parsing doesn't currently extract/store a closing date. If screening happens long after a JD's closing date, the age calculation could be slightly off. The proper fix is to extract the closing date during JD parsing and store it on `JobProfile` -- this is still pending.

**How batch screening works:**
1. `POST /screen` returns a `run_id` immediately -- it doesn't wait for the whole batch to finish. The actual processing happens **in the background**.
2. By default, only candidates with `status == "not_evaluated"` are screened (so re-calling this doesn't waste Gemini calls re-evaluating people who already have a result). Pass `?force=true` to re-evaluate everyone regardless of current status (e.g. after editing criteria).
3. Poll `GET /screening-runs/{run_id}` repeatedly for progress -- `processed_count` climbs toward `total_candidates`.
4. **If a single candidate's processing fails for any reason** (unexpected error), the whole batch does not stop -- that candidate is marked `not_evaluated`, `failed_count` increments, and the rest of the batch continues.

### Results + Export
| Method | Path | Purpose |
|---|---|---|
| GET | `/jd/profiles/{profile_id}/results` | Summary counts + candidate list, sorted Eligible first |
| GET | `/jd/profiles/{profile_id}/results/export` | Download results as an Excel file |

**Query parameter:** `?status=eligible` (or `not_eligible` / `needs_review` / `not_evaluated`) filters both endpoints down to just one bucket. Omit it to get everyone.

**Export columns:** Candidate ID, Name, Email, Phone, Status -- sorted with Eligible candidates first, then Needs Review, then Not Eligible, then Not Evaluated.

### Manual Review
| Method | Path | Purpose |
|---|---|---|
| GET | `/jd/profiles/{profile_id}/candidates/{candidate_id}/review` | Full criterion-by-criterion breakdown for one candidate |
| PATCH | `/jd/profiles/{profile_id}/candidates/{candidate_id}/override` | HR manually sets the final status, overriding the computed result |

**How it works:**
- `candidate.computed_status` holds whatever the automated evaluation (age rule + Gemini) originally decided -- this is preserved even after an override, so the original assessment is never lost.
- `candidate.status` is the *effective* status everyone sees (Results, Export, Dashboard). It starts equal to `computed_status`, but HR can change it via `PATCH .../override`.
- The override body is `{"new_status": "eligible" | "not_eligible" | "needs_review", "reason": "optional text"}`. Invalid status values are rejected with a validation error.
- Every override records who made it and when (`overridden_by`, `overridden_at`), plus the stated reason -- visible via the `/review` endpoint.
- **Re-running evaluation clears any prior override** -- a fresh evaluation is treated as a new authoritative assessment, so `status_overridden` resets to `false` and `status` goes back to matching the newly computed value. HR can review and override again if needed.

### Dashboard
| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/summary` | Aggregated overview: total profiles, candidates per stage, recent JD uploads, recent screening runs |

**Returns:**
- `total_job_profiles` -- count of active Job Profiles
- `total_candidates` -- count of all candidates across all profiles
- `candidates_by_status` -- counts for all four buckets (`eligible`, `not_eligible`, `needs_review`, `not_evaluated`), always includes all four even if some are zero
- `recent_jd_uploads` -- last 10 JD uploads, with how many Job Profiles each one created
- `recent_screening_runs` -- last 10 batch screening runs, with their profile title, progress, and status

Nothing is computed fresh here -- it's a pure aggregation over data already stored by the other endpoints.

### Document Verification
| Method | Path | Purpose |
|---|---|---|
| POST | `/jd/profiles/{profile_id}/candidates/{candidate_id}/verify` | Run identity verification for one candidate (only allowed if their status is `eligible`) |
| GET | `/jd/profiles/{profile_id}/candidates/{candidate_id}/verification` | Fetch current verification results without re-running them |
| PATCH | `/jd/profiles/{profile_id}/candidates/{candidate_id}/verification/{verification_id}/decision` | HR verifies or rejects one field-level result, with notes |

**How it works:**
- Only candidates with `status == "eligible"` can be verified -- this is a post-screening step, not a substitute for it.
- Re-extracts **name** and **date of birth** from the candidate's `10th_marksheet` document (chosen because one of the actual parsed JDs explicitly states: *"10th Certificate/marksheet is mandatory for Date of Birth (DOB) Verification"*), and compares them against the candidate's declared form data (captured from the Excel at ingestion time).
- Each field gets its own `DocumentVerification` row, with a `match_status` of `matched` / `mismatch` / `low_confidence` / `extraction_failed`.
- Date comparison is format-tolerant -- `1999-11-17` and `17-11-1999` are correctly treated as the same date, not a mismatch, since candidate data and re-extracted document text can use different date formats.
- Re-running verification clears previous results first, so repeated calls don't pile up duplicate rows.

**Scanned/image-based PDF support:** Verification tries text extraction first (`pdfplumber`). If a document has little or no embedded text (common for scanned marksheets/certificates), it falls back to rendering the first page as an image (via `pymupdf`) and sending that image directly to Gemini's vision capability for extraction, instead of just failing.

**⚠️ Important honesty note:** this image-based fallback path (`extract_identity_fields_from_image_with_gemini` in `gemini_service.py`, and the PyMuPDF rendering in `document_verification.py`) could not be tested against the live Gemini API or a real PyMuPDF install in the sandbox this backend was built in (no network/package access there) -- everything else in this backend was verified against the real API and a real database, but this specific piece has only been syntax-checked, not run. Please test it as your first check after updating: run `/verify` on a candidate whose 10th marksheet is a scanned image (like the sample data), and confirm it returns actual extracted values instead of erroring out. If the Gemini image API call needs adjusting for your installed `google-genai` version, that's the first place to look.

## Testing Without a Frontend

Every endpoint above can be tested directly from `/docs` (Swagger UI):
"Try it out" -> fill in parameters/body -> "Execute". A typical end-to-end
test flow:

1. `POST /auth/login` (log in first -- everything else requires this)
2. `POST /jd/upload` with a JD PDF -> note a `job_profile_id` from the response
3. `GET /jd/profiles/{profile_id}` -> review the auto-extracted criteria
4. `POST /jd/profiles/{profile_id}/candidates/upload` with the Excel + master ZIP
5. `GET /jd/profiles/{profile_id}/candidates` -> note a `candidate_id`
6. `POST /jd/profiles/{profile_id}/candidates/{candidate_id}/evaluate` -> see the full criterion-by-criterion breakdown
7. Or for multiple candidates: `POST /jd/profiles/{profile_id}/screen`, then poll `GET /screening-runs/{run_id}`

## Folder Structure

```
app/
  main.py                    -- FastAPI app entry point
  db/
    base.py                   -- SQLAlchemy declarative base
    session.py                 -- DB engine + session dependency
  models/
    hr_user.py                 -- HRUser (auth)
    job_profile.py              -- JDUpload, JobProfile, Criterion, AgeRelaxationRule
    candidate.py                -- Candidate, CandidateDocument
    criterion_evaluation.py     -- CriterionEvaluation
    screening_run.py            -- ScreeningRun (batch progress tracking)
  schemas/
    job_profile.py              -- Pydantic shapes for JD/profile/criteria endpoints
    candidate.py                 -- Pydantic shapes for candidate upload/listing
    screening.py                 -- Pydantic shapes for evaluation/screening endpoints
  services/
    pdf_extraction.py           -- PDF -> plain text
    gemini_service.py            -- Gemini prompts + calls + retry logic (JD parsing + criterion evaluation)
    age_relaxation.py           -- category normalization, validation guardrails, rule-based age evaluation
    candidate_ingestion.py      -- Excel parsing + ZIP/document matching logic
    candidate_evaluation.py     -- orchestrates full-candidate evaluation (age rule + Gemini + final bucket)
    auth_service.py              -- password hashing, session cookie signing/verification
  routers/
    auth.py                      -- login/logout/me
    jd_upload.py                  -- POST /jd/upload
    job_profiles.py               -- Job Profiles listing + Criteria Editor
    candidates.py                 -- candidate upload + listing
    screening.py                  -- single-candidate evaluation + batch screening
    results.py                    -- results summary + Excel export
    review.py                      -- Manual Review: criterion breakdown + HR override
    dashboard.py                    -- aggregated summary
    verification.py                 -- Document Verification: identity re-check + HR decision
scripts/
  create_hr_user.py             -- command-line HR account creation
```

## Still Missing (future steps)

- JD closing date extraction/storage (see the age evaluation limitation above)
- The scanned-document image fallback (see the honesty note above) needs to be tested against the real Gemini API -- it was written but not runnable in the sandbox this was built in
- The same scanned-image fallback could be extended to JD parsing and candidate document evaluation too, if those ever encounter scanned inputs (currently only Document Verification has this fallback)
