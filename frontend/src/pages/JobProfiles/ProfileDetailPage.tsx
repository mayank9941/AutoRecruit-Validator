import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Edit2, Trash2, Plus, Save, BarChart3, Users, RotateCcw,
  ArrowRight, ArrowLeft, Check, UploadCloud, Loader2, AlertTriangle, Search,
} from 'lucide-react';
import { useJobProfile, useAddCriterion, useUpdateCriterion, useDeleteCriterion } from '../../hooks/useJobProfile';
import { useDeleteProfile } from '../../hooks/useJobProfiles';
import { useCandidates } from '../../hooks/useCandidates';
import { useStartScreening, useScreeningRun } from '../../hooks/useScreening';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBadge } from '../../components/StatusBadge';
import { CandidateUploadPanel } from '../../components/CandidateUploadPanel';
import type { Criterion } from '../../types';

const CRITERION_TYPES = ['age', 'education', 'experience', 'skill', 'other'];

type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'JD criteria' },
  { n: 2, label: 'Upload candidates' },
  { n: 3, label: 'Results' },
];

const STEP_INSTRUCTIONS: Record<Step, string> = {
  1: 'Check the criteria below. Edit anything that looks wrong, then press Confirm criteria.',
  2: 'Upload the two files below, then press Upload & Start Screening.',
  3: 'Results for every candidate are listed below.',
};

export const ProfileDetailPage: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const { data: profile, isLoading } = useJobProfile(profileId);
  const { data: candidates, isLoading: candidatesLoading } = useCandidates(profileId);
  const addCriterion = useAddCriterion(profileId);
  const updateCriterion = useUpdateCriterion(profileId);
  const deleteCriterion = useDeleteCriterion(profileId);
  const startScreening = useStartScreening(profileId);
  const deleteProfile = useDeleteProfile();
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const { data: run } = useScreeningRun(profileId, runId);

  // Wizard step. Until the user navigates manually, the step is derived
  // from the data: a profile that already has candidates goes STRAIGHT to
  // Results; a fresh JD starts at the criteria review step.
  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const hasCandidates = (candidates?.length ?? 0) > 0;
  const step: Step = stepOverride ?? (hasCandidates ? 3 : 1);

  // When a screening run finishes, refresh the candidates table and
  // dashboard so status badges update automatically without a page reload.
  useEffect(() => {
    if (run?.status === 'completed' || run?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    }
  }, [run?.status, profileId, queryClient]);

  // While screening runs, refresh the candidates table on every progress
  // tick so results stream into the table live instead of appearing only
  // at the very end.
  useEffect(() => {
    if (run?.status === 'running' && run.processed_count > 0) {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
    }
  }, [run?.processed_count, run?.status, profileId, queryClient]);

  // Upload phase tracking -- the wizard switches to the Results screen the
  // moment "Upload & Start Screening" is clicked, so the user watches one
  // status component go: uploading -> screening -> results.
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [uploadPhaseError, setUploadPhaseError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Criterion>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newCriterion, setNewCriterion] = useState<{
    type: string;
    description: string;
    is_essential: boolean;
    required_match_percentage: number | null;
  }>({
    type: 'other',
    description: '',
    is_essential: true,
    required_match_percentage: null,
  });

  // Client-side search over the candidates table (step 3).
  const [candidateSearch, setCandidateSearch] = useState('');

  if (isLoading || candidatesLoading) return <p className="text-sm font-medium text-muted">Loading job profile…</p>;
  if (!profile) return <p className="text-sm font-medium text-danger">Job profile not found.</p>;

  const startEdit = (c: Criterion) => {
    setEditingId(c.id);
    setDraft({
      type: c.type,
      description: c.description,
      is_essential: c.is_essential,
      required_match_percentage: c.required_match_percentage ?? null,
    });
  };

  const saveEdit = async (criterionId: string) => {
    await updateCriterion.mutateAsync({ criterionId, payload: draft });
    setEditingId(null);
  };

  const handleAddCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCriterion.description.trim()) return;
    await addCriterion.mutateAsync(newCriterion);
    setNewCriterion({ type: 'other', description: '', is_essential: true, required_match_percentage: null });
    setAddingNew(false);
  };

  const handleStartScreening = async (force = false) => {
    setScreeningError(null);
    setRunId(null);
    try {
      const result = await startScreening.mutateAsync(force);
      setRunId(result.id);
    } catch (err: any) {
      setScreeningError(err?.detail || err?.message || 'Something went wrong while starting screening. Please try again, or contact IT support if it keeps happening.');
    }
  };

  // Step 2's single action, in three beats: the moment upload starts we
  // jump to Results with an "uploading" banner; when the upload lands we
  // kick off screening (live progress bar); results stream in below.
  const handleUploadStart = () => {
    setUploadPhaseError(null);
    setScreeningError(null);
    setRunId(null);
    setUploadPhase('uploading');
    setStepOverride(3);
  };

  const handleUploadedAndScreen = async () => {
    setUploadPhase('idle');
    await handleStartScreening(false);
  };

  const handleUploadError = (message: string) => {
    setUploadPhase('error');
    setUploadPhaseError(message);
  };

  const statusCounts = (candidates ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const searchTerm = candidateSearch.trim().toLowerCase();
  // Eligible first, then needs review, then not eligible, then unscreened.
  const STATUS_ORDER: Record<string, number> = {
    eligible: 0,
    needs_review: 1,
    not_eligible: 2,
    not_evaluated: 3,
  };
  const filteredCandidates = (candidates ?? [])
    .filter(
      (c) =>
        !searchTerm ||
        (c.name ?? '').toLowerCase().includes(searchTerm) ||
        (c.external_id ?? '').toLowerCase().includes(searchTerm) ||
        (c.email ?? '').toLowerCase().includes(searchTerm)
    )
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));

  const isStepReachable = (n: Step) =>
    n === 3 ? hasCandidates || !!runId || uploadPhase !== 'idle' || step === 3 : true;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-bold text-2xl text-foreground">{profile.title}</h1>
          <p className="text-sm text-foreground font-normal mt-1">
            {profile.method_of_recruitment || 'Job profile'}
            {profile.pay_scale ? ` · ${profile.pay_scale}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/reports/${profile.id}`}
            className="bg-card border border-border font-semibold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 text-foreground hover:border-primary/40"
          >
            <BarChart3 className="w-4 h-4 text-primary" />
            Full report
          </Link>
          <button
            onClick={async () => {
              if (
                window.confirm(
                  `Delete "${profile.title}"?\n\nThis permanently removes the JD profile along with ALL its candidates, documents and screening results. This cannot be undone.`
                )
              ) {
                await deleteProfile.mutateAsync(profile.id);
                navigate('/recruitment');
              }
            }}
            disabled={deleteProfile.isPending}
            className="bg-card border border-border font-semibold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 text-danger hover:border-danger/40 disabled:opacity-50"
            title="Delete this JD and all its data"
          >
            <Trash2 className="w-4 h-4" />
            {deleteProfile.isPending ? 'Deleting…' : 'Delete JD'}
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
        <div className="flex items-center">
          {STEPS.map(({ n, label }, i) => {
            const isActive = step === n;
            const isDone = step > n;
            const reachable = isStepReachable(n);
            return (
              <React.Fragment key={n}>
                {i > 0 && <div className={`flex-1 h-0.5 mx-2 rounded-full ${step > i ? 'bg-primary' : 'bg-border'}`} />}
                <button
                  onClick={() => reachable && setStepOverride(n)}
                  disabled={!reachable}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive ? 'bg-primary/10' : reachable ? 'hover:bg-accent' : 'opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : isDone
                        ? 'bg-success/10 text-success border-success/30'
                        : 'bg-accent text-muted border-border'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : n}
                  </span>
                  <span className="text-left">
                    <span className={`block text-xs font-medium ${isActive ? 'text-primary' : 'text-muted'}`}>
                      Step {n}
                    </span>
                    <span className={`block text-sm font-semibold ${isActive ? 'text-foreground' : 'text-muted'}`}>{label}</span>
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <p className="text-sm font-normal text-foreground mt-3 pt-3 border-t border-border">
          {STEP_INSTRUCTIONS[step]}
        </p>
      </div>

      {/* ---------------- STEP 1: JD CRITERIA ---------------- */}
      {step === 1 && (
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4 max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Edit2 className="w-4.5 h-4.5 text-primary" />
                <h2 className="font-semibold text-base text-foreground">Review JD criteria</h2>
              </div>
              <p className="text-sm text-muted font-normal mt-1">
                These were auto-extracted from the JD. Edit, add or remove anything, then confirm to continue.
              </p>
            </div>
            <button
              onClick={() => setAddingNew((v) => !v)}
              className="text-sm font-semibold text-primary flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-border hover:border-primary/40 shrink-0"
            >
              <Plus className="w-4 h-4" /> Add criterion
            </button>
          </div>

          {profile.base_age_min != null && (
            <div className="text-sm font-medium text-foreground bg-accent/50 rounded-lg px-3 py-2">
              Base age range: {profile.base_age_min}–{profile.base_age_max}
              {profile.age_relaxation_rules.length > 0 &&
                ` · ${profile.age_relaxation_rules.length} category relaxation rule(s) apply automatically`}
            </div>
          )}

          {addingNew && (
            <form onSubmit={handleAddCriterion} className="flex flex-col gap-3 bg-accent/40 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newCriterion.type}
                  onChange={(e) =>
                    setNewCriterion((c) => ({
                      ...c,
                      type: e.target.value,
                      // Skills are informational by default — they only gate
                      // eligibility if HR deliberately makes them essential.
                      is_essential: e.target.value === 'skill' ? false : c.is_essential,
                    }))
                  }
                  className="bg-card border border-border text-foreground text-sm font-medium p-2.5 rounded-lg"
                >
                  {CRITERION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={newCriterion.is_essential}
                    onChange={(e) => setNewCriterion((c) => ({ ...c, is_essential: e.target.checked }))}
                  />
                  Essential
                </label>
              </div>
              {newCriterion.type === 'skill' && newCriterion.is_essential && (
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  Minimum match % to qualify:
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newCriterion.required_match_percentage ?? ''}
                    onChange={(e) =>
                      setNewCriterion((c) => ({
                        ...c,
                        required_match_percentage: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="e.g. 60"
                    className="bg-card border border-border text-foreground text-sm font-medium p-2 rounded-lg w-24"
                  />
                  <span className="text-sm text-muted font-normal">
                    Candidates below this score will be marked not eligible.
                  </span>
                </label>
              )}
              <textarea
                value={newCriterion.description}
                onChange={(e) => setNewCriterion((c) => ({ ...c, description: e.target.value }))}
                placeholder="Describe the criterion…"
                required
                className="bg-card border border-border text-foreground text-sm font-normal p-3 rounded-lg w-full min-h-[60px]"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setAddingNew(false)}
                  className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-border text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addCriterion.isPending}
                  className="text-sm font-semibold px-5 py-2.5 rounded-lg bg-primary text-primary-foreground"
                >
                  Save criterion
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-col gap-2">
            {profile.criteria
              .slice()
              .sort((a, b) => a.display_order - b.display_order)
              .map((c) => (
                <div key={c.id} className="border border-border rounded-lg p-4">
                  {editingId === c.id ? (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={draft.type}
                          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                          className="bg-accent/40 border border-border text-foreground text-sm font-medium p-2 rounded-lg"
                        >
                          {CRITERION_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <input
                            type="checkbox"
                            checked={!!draft.is_essential}
                            onChange={(e) => setDraft((d) => ({ ...d, is_essential: e.target.checked }))}
                          />
                          Essential
                        </label>
                      </div>
                      {draft.type === 'skill' && draft.is_essential && (
                        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                          Minimum match % to qualify:
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={draft.required_match_percentage ?? ''}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                required_match_percentage: e.target.value === '' ? null : Number(e.target.value),
                              }))
                            }
                            placeholder="e.g. 60"
                            className="bg-card border border-border text-foreground text-sm font-medium p-2 rounded-lg w-24"
                          />
                          <span className="text-sm text-muted font-normal">
                            Candidates below this score will be marked not eligible.
                          </span>
                        </label>
                      )}
                      <textarea
                        value={draft.description}
                        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                        className="bg-accent/40 border border-border text-foreground text-sm font-normal p-2.5 rounded-lg w-full min-h-[50px]"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-border text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(c.id)}
                          className="text-sm font-semibold px-5 py-2.5 rounded-lg bg-primary text-primary-foreground flex items-center gap-1.5"
                        >
                          <Save className="w-4 h-4" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                            {c.type}
                          </span>
                          {c.is_essential && (
                            <span className="text-xs font-medium px-2 py-0.5 bg-danger/10 text-danger rounded-md">
                              Essential
                            </span>
                          )}
                          {c.type === 'skill' && c.is_essential && c.required_match_percentage != null && (
                            <span className="text-xs font-medium px-2 py-0.5 bg-warning/10 text-warning rounded-md">
                              Minimum {c.required_match_percentage}% match required
                            </span>
                          )}
                          {c.type === 'skill' && !(c.is_essential && c.required_match_percentage != null) && (
                            <span className="text-xs font-medium px-2 py-0.5 bg-accent text-foreground rounded-md">
                              Information only
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-normal text-foreground">{c.description}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-border text-foreground flex items-center gap-1.5"
                          title="Edit criterion"
                        >
                          <Edit2 className="w-4 h-4 text-muted" />
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCriterion.mutate(c.id)}
                          className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-border text-danger flex items-center gap-1.5"
                          title="Delete criterion"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            {profile.criteria.length === 0 && (
              <p className="text-sm text-muted font-normal">No criteria yet — add one above.</p>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <button
              onClick={() => setStepOverride(2)}
              disabled={profile.criteria.length === 0}
              className="bg-primary text-primary-foreground font-semibold text-sm px-6 py-3 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm criteria
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 2: UPLOAD CANDIDATES ---------------- */}
      {step === 2 && (
        <div className="flex flex-col gap-4 max-w-2xl">
          <button
            onClick={() => setStepOverride(1)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-primary transition-colors self-start px-2 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" /> Back to criteria
          </button>

          <CandidateUploadPanel
            profileId={profileId}
            actionLabel="Upload & Start Screening"
            onUploadStart={handleUploadStart}
            onUploaded={handleUploadedAndScreen}
            onUploadError={handleUploadError}
          />

          {hasCandidates && (
            <div className="bg-accent/40 border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm font-normal text-foreground">
                {candidates!.length} candidate{candidates!.length === 1 ? '' : 's'} already uploaded for this profile.
                Re-uploading the same roster replaces them.
              </p>
              <button
                onClick={() => setStepOverride(3)}
                className="text-sm font-semibold text-primary flex items-center gap-1.5 shrink-0 px-2 py-1.5 rounded-lg"
              >
                Skip to results <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- STEP 3: RESULTS ---------------- */}
      {step === 3 && (
        <div className="flex flex-col gap-6">
          {/* Phase banner: uploading -> screening -> done */}
          {uploadPhase === 'uploading' && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 flex items-center gap-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin shrink-0" />
              <div>
                <p className="text-base font-semibold text-foreground">Uploading candidates & matching documents…</p>
                <p className="text-sm text-muted font-normal mt-0.5">
                  Screening will start automatically as soon as the upload finishes — you can stay on this screen.
                </p>
              </div>
            </div>
          )}

          {uploadPhase === 'error' && (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-6 flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-base font-semibold text-danger">Upload failed</p>
                <p className="text-sm text-foreground font-normal mt-0.5">{uploadPhaseError}</p>
              </div>
              <button
                onClick={() => {
                  setUploadPhase('idle');
                  setStepOverride(2);
                }}
                className="bg-card border border-border font-semibold text-sm px-5 py-2.5 rounded-lg text-foreground hover:border-primary/40 shrink-0"
              >
                Back to upload
              </button>
            </div>
          )}

          {run?.status === 'running' && run.total_candidates > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin shrink-0" />
                <div className="flex-1">
                  <p className="text-base font-semibold text-foreground">
                    Screening candidates against the JD criteria… {run.processed_count}/{run.total_candidates} done
                    {run.failed_count > 0 ? ` · ${run.failed_count} failed` : ''}
                  </p>
                  <p className="text-sm text-muted font-normal mt-0.5">
                    Each candidate's declared data and documents are being verified. Results appear in the table below as they finish.
                  </p>
                </div>
                <span className="text-2xl font-bold text-primary shrink-0">
                  {Math.round((run.processed_count / run.total_candidates) * 100)}%
                </span>
              </div>
              <div className="h-2.5 bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(run.processed_count / run.total_candidates) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions + summary */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-4 flex-wrap">
                {(['eligible', 'needs_review', 'not_eligible', 'not_evaluated'] as const).map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <StatusBadge status={s} />
                    <span className="text-base font-bold text-foreground">{statusCounts[s] ?? 0}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setStepOverride(2)}
                  className="bg-card border border-border text-foreground font-semibold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 hover:border-primary/40"
                >
                  <UploadCloud className="w-4 h-4" /> Upload more
                </button>
                <button
                  onClick={() => handleStartScreening(true)}
                  disabled={startScreening.isPending || run?.status === 'running' || uploadPhase === 'uploading'}
                  className="bg-primary text-primary-foreground font-semibold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" /> Re-screen all
                </button>
              </div>
            </div>

            {screeningError && (
              <p className="text-sm font-medium text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                {screeningError}
              </p>
            )}

            {run && run.total_candidates === 0 && (
              <p className="text-sm font-normal text-muted">
                Everyone already has a result — use Re-screen all to re-evaluate all candidates against the current criteria.
              </p>
            )}

            {run && run.total_candidates > 0 && run.status !== 'running' && (
              <div className="flex items-center justify-between text-sm font-medium text-foreground">
                <span>
                  Screening finished — {run.processed_count}/{run.total_candidates} candidates processed
                  {run.failed_count > 0 ? ` · ${run.failed_count} failed` : ''}
                </span>
                <StatusBadge status={run.status} />
              </div>
            )}
            {run?.error_message && (
              <p className="text-sm font-medium text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                Error: {run.error_message}
              </p>
            )}
          </div>

          {/* Candidate list */}
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-base text-foreground">Candidates</h2>
              <div className="flex items-center gap-2">
                {candidates && candidates.length > 0 && (
                  <span className="text-sm font-medium px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-md">
                    {candidates.length} total
                  </span>
                )}
              </div>
            </div>

            {!candidates || candidates.length === 0 ? (
              <div className="px-6 py-10 text-center flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-accent border border-border flex items-center justify-center">
                  <Users className="w-5 h-5 text-muted" />
                </div>
                <p className="text-base font-semibold text-foreground">No candidates yet</p>
                <p className="text-sm text-muted font-normal">Go to Step 2 to upload the candidate roster and documents ZIP.</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-3 border-b border-border">
                  <div className="relative max-w-md">
                    <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      placeholder="Search by name, ID or email…"
                      className="w-full bg-card border border-border text-foreground text-sm font-normal rounded-lg pl-9 pr-3 py-2.5 placeholder:text-muted"
                    />
                  </div>
                </div>
                {filteredCandidates.length === 0 ? (
                  <div className="px-6 py-8 text-center">
                    <p className="text-sm font-normal text-foreground">No candidates match your search.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-accent/60 border-b border-border text-left">
                          <th className="py-3 px-5 text-sm font-semibold text-foreground">Candidate</th>
                          <th className="py-3 px-5 text-sm font-semibold text-foreground">Email</th>
                          <th className="py-3 px-5 text-sm font-semibold text-foreground">Documents</th>
                          <th className="py-3 px-5 text-sm font-semibold text-foreground">Status</th>
                          <th className="py-3 px-5" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCandidates.map((c, i) => (
                          <tr key={c.id} className={`border-b border-border/60 hover:bg-accent/40 transition-colors ${i % 2 !== 0 ? 'bg-accent/20' : ''}`}>
                            <td className="py-3 px-5 font-medium text-foreground">{c.name || c.external_id}</td>
                            <td className="py-3 px-5 font-normal text-foreground">{c.email || '—'}</td>
                            <td className="py-3 px-5"><StatusBadge status={c.ingestion_status} /></td>
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-1.5">
                                <StatusBadge status={c.status} />
                                {c.status_overridden && (
                                  <span className="text-xs font-medium text-warning bg-warning/10 border border-warning/20 rounded-md px-1.5 py-0.5">edited</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-5 text-right">
                              <Link to={`/candidate/${profile.id}/${c.id}`} className="text-sm font-semibold text-primary hover:underline">
                                Review →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

export default ProfileDetailPage;
