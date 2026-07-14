# IHMCL HR Screening System -- Frontend

React + Vite frontend for the IHMCL HR Screening System. Talks to the
FastAPI backend via cookie-based session auth.

This step covers: project setup, the shared design system, Login, the
sidebar layout, Dashboard, Job Profiles (JD upload + list), the Profile
Detail / Criteria Editor screen, Candidate Upload + list, and the
Screening trigger with live progress polling. Every other screen
(Results, Review, Verification) comes in later steps, the same way the
backend was built one endpoint at a time.

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
                                    .upload-list) reused across every page that needs them
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

## Testing this step

1. On a profile's Candidates page (with at least one candidate whose documents are complete), click "Run Screening"
2. A progress bar should appear immediately, showing "X of Y processed" and "Running…"
3. Poll should update every ~1.5s -- watch processed_count climb toward total_candidates
4. Once it reaches 100% and the backend marks the run "completed", the progress label should switch to "Completed", and the candidates table above should refresh automatically to show updated statuses (Eligible/Not Eligible/Needs Review)
5. Try "Re-screen all" -- should re-evaluate every candidate regardless of current status (useful after editing criteria)
6. If a candidate's documents are incomplete/missing, their status should end up "Not Evaluated" after screening (skipped, not failed)

## Still Missing (future steps)

- Results screen + export
- Manual Review screen
- Document Verification screen
