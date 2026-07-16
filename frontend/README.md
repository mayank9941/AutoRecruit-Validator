# IHMCL HR Screening System -- Frontend

React + Vite frontend for the IHMCL HR Screening System. Talks to the
FastAPI backend via cookie-based session auth.

This step covers the full HR flow, screen by screen: Login, Dashboard,
Job Profiles (JD upload + list), Profile Detail / Criteria Editor,
Candidate Upload + list, Screening with live progress, Results (filter +
export), Manual Review (criterion breakdown + HR override), and Document
Verification (identity re-check for Eligible candidates + HR
verify/reject decisions). This completes the first full pass of the
frontend, built the same way the backend was -- one screen at a time,
each one tested against the real API before moving to the next.

## Setup

### 1. Install dependencies
```bash
cd ihmcl_frontend
npm install
```

### 2. Configure the backend URL
```bash
cp .env.example .env
```
The default (`http://localhost:8000`) is already correct if you're
running the backend locally on its default port -- only change this if
your backend runs somewhere else.

### 3. Update the backend (important -- CORS)

This frontend runs on a different port (`5173`) than the backend
(`8000`), so the backend needs to explicitly allow it. **The backend's
`app/main.py` has been updated** with CORS middleware -- make sure you're
running the latest backend zip, or apply this change yourself if you're
working from an older copy: it adds `CORSMiddleware` allowing
`http://localhost:5173`.

If you're not sure, just re-download the latest backend zip and restart
`uvicorn`.

### 4. Run the dev server
```bash
npm run dev
```
Open `http://localhost:5173`. You should land on the Login page.

### 5. Log in

Use the same HR account you created earlier for the backend
(`python scripts/create_hr_user.py ...`). On success, you'll be
redirected to the Dashboard, showing real data from your backend
(job profile counts, candidate status breakdown, recent activity).

## What's in this step

```
src/
  main.jsx                    -- entry point, wraps the app in QueryClientProvider
  App.jsx                      -- routing (BrowserRouter, AuthProvider, ProtectedRoute)
  styles/
    tokens.css                  -- light theme design tokens (colors, radii, fonts)
    base.css                    -- reset + shared .glass-card recipe + orb backgrounds +
                                    shared page patterns (.back-link, .section-title,
                                    .upload-file-input/-label, .upload-error, .upload-result,
                                    .upload-list, .candidate-name/-id, .data-table/-table-card,
                                    .criterion-tags/-type/-essential/-description) reused
                                    across every page that needs them
  lib/
    api.js                       -- fetch wrapper (credentials: "include", JSON handling, error parsing)
    format.js                     -- date/time formatting helper
  hooks/
    useDashboard.js               -- react-query hook for GET /dashboard/summary
    useJobProfiles.js              -- react-query hooks: list profiles, upload JD (mutation)
    useJobProfile.js               -- react-query hooks: single profile detail, add/update/delete criterion
    useCandidates.js               -- react-query hooks: list candidates, upload candidates (mutation)
    useScreening.js                 -- react-query hooks: start screening (mutation), poll a
                                        screening run's progress (auto-refetches while "running")
    useResults.js                   -- react-query hook: GET .../results, refetches when the
                                        status filter changes
    useReview.js                     -- react-query hooks: candidate review detail, override status (mutation)
    useVerification.js               -- react-query hooks: fetch verification, run verification
                                        (mutation), submit HR decision per field (mutation)
  context/
    AuthContext.jsx              -- login/logout/session state, checks /auth/me on load
    ProtectedRoute.jsx           -- redirects to /login if not authenticated
  components/
    Button/                      -- primary / glass / ghost variants
    Input/                        -- labeled input/select/textarea field
    GlassCard/                    -- the shared glass panel primitive
    Badge/                        -- status pill (maps candidate statuses to colors)
    ProgressBar/                   -- simple animated progress bar (screening progress)
    Sidebar/                      -- persistent nav, shown on every page after Login
  layouts/
    AppLayout/                    -- wraps every page except Login: background, orbs, sidebar, content area
  pages/
    Login/                        -- dark "void" theme, fully self-contained (does not
                                      reuse the shared Button/Input -- see note below)
    Dashboard/                    -- real data from GET /dashboard/summary: profile/candidate
                                      counts, status breakdown, recent uploads, recent runs
    JobProfiles/                  -- JD upload (file picker + POST /jd/upload) and the
                                      resulting Job Profiles grid (GET /jd/profiles),
                                      refetched automatically after a successful upload
    ProfileDetail/                -- one profile's full detail: age relaxation rules
                                      (read-only) + the Criteria Editor (inline edit,
                                      add, delete -- each criterion is its own row), plus
                                      a button linking to that profile's Candidates page
    Candidates/                   -- upload the candidate master data file + master ZIP
                                      (POST .../candidates/upload) and view the resulting
                                      candidates table (ingestion status + screening status);
                                      also has "Run Screening" / "Re-screen all" buttons that
                                      start a batch run and poll its progress live until done
    Results/                      -- filterable results table (Eligible/Not Eligible/Needs
                                      Review/Not Evaluated tabs) with summary counts, and an
                                      "Export to Excel" link straight to the backend's
                                      streamed .xlsx download (a plain <a> tag, not a fetch
                                      call -- see note below); rows are clickable through to
                                      Manual Review
    Review/                       -- one candidate's full criterion-by-criterion breakdown
                                      (result, citation, reasoning per criterion) plus a form
                                      for HR to override the final status with a reason;
                                      reachable by clicking a row on Candidates or Results
    Verification/                 -- for "Eligible" candidates: re-extracts name + DOB from
                                      their 10th marksheet and compares against form data,
                                      showing a match/mismatch/low-confidence/extraction-failed
                                      badge per field, with a per-field HR verify/reject
                                      decision + notes form
```

## Design notes

- **Two themes, deliberately separate.** The light "glass" theme (in
  `styles/tokens.css` + `base.css`) is used by every real screen. Login
  uses its own dark "void" theme, fully scoped inside `Login.css` --
  it does not reuse the shared `Button`/`Input` components, because their
  styling has some hardcoded light-theme values (gradients, literal
  colors) that wouldn't invert cleanly for a dark background. Login uses
  its own plain form elements instead, styled to match exactly.
- **Candidate status colors are centralized** in `Badge.jsx`'s
  `STATUS_MAP` -- eligible/not_eligible/needs_review/not_evaluated each
  map to a label + color once, so every future screen that shows a status
  looks consistent automatically.
- **The Excel export uses a plain `<a href=...>` link, not a `fetch` call.**
  Since it's a simple top-level GET navigation (not an XHR/JS request), it
  bypasses CORS entirely and the session cookie is sent normally under
  `SameSite=Lax` -- no need for blob-URL download gymnastics in JS.

## Testing this step

1. Get a candidate to "Eligible" status (via screening or a manual override), then open their Review page
2. Click "Document Verification →" in the top right
3. Click "Run Verification" -- this re-extracts name + DOB from their 10th marksheet (works for both text-based and scanned/image marksheets, per the backend's Gemini vision fallback) and compares against their form data
4. Each field (Name, Date of Birth) should show a match-status badge (matched/mismatch/low confidence/extraction failed), the form value vs. extracted value side by side, and the extraction confidence
5. For each field without an existing HR decision, use the "Verify"/"Reject" form + optional notes, then "Save decision" -- it should immediately switch to a read-only decided state showing your choice and notes
6. Try this on a candidate who is NOT "Eligible" -- the page should show a message explaining verification only applies to Eligible candidates, without a "Run Verification" button
7. Re-run verification -- previous decisions should be cleared (fresh extraction), matching the backend's documented behavior of resetting on re-verification

## This completes the first full pass of the frontend

Every screen in the original HR flow now exists and talks to the real
backend: Login → Dashboard → JD Upload/Job Profiles → Criteria Editor →
Candidate Upload → Screening → Results → Manual Review → Document
Verification. From here, further work would be refinement (polish,
responsive/mobile pass, empty/loading/error states, accessibility) rather
than new screens -- unless new backend functionality is added first.
