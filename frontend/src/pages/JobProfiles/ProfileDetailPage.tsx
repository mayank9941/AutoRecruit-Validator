import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Edit2, Trash2, Plus, Save, PlayCircle, BarChart3, FileCheck2, Users, RotateCcw,
} from 'lucide-react';
import { useJobProfile, useAddCriterion, useUpdateCriterion, useDeleteCriterion } from '../../hooks/useJobProfile';
import { useCandidates, useResetCandidates } from '../../hooks/useCandidates';
import { useStartScreening, useScreeningRun } from '../../hooks/useScreening';
import { useBatchVerification } from '../../hooks/useVerification';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBadge } from '../../components/StatusBadge';
import { CandidateUploadPanel } from '../../components/CandidateUploadPanel';
import type { Criterion } from '../../types';

const CRITERION_TYPES = ['age', 'education', 'experience', 'skill', 'other'];

export const ProfileDetailPage: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const { data: profile, isLoading } = useJobProfile(profileId);
  const { data: candidates, isLoading: candidatesLoading } = useCandidates(profileId);
  const addCriterion = useAddCriterion(profileId);
  const updateCriterion = useUpdateCriterion(profileId);
  const deleteCriterion = useDeleteCriterion(profileId);
  const startScreening = useStartScreening(profileId);
  const batchVerification = useBatchVerification(profileId);
  const resetCandidates = useResetCandidates(profileId);

  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const { data: run } = useScreeningRun(profileId, runId);

  // When a screening run finishes, refresh the candidates table and
  // dashboard so status badges update automatically without a page reload.
  useEffect(() => {
    if (run?.status === 'completed' || run?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    }
  }, [run?.status, profileId, queryClient]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Criterion>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newCriterion, setNewCriterion] = useState<{ type: string; description: string; is_essential: boolean }>({
    type: 'other',
    description: '',
    is_essential: true,
  });

  if (isLoading) return <p className="text-sm font-semibold text-muted">Loading job profile…</p>;
  if (!profile) return <p className="text-sm font-semibold text-danger">Job profile not found.</p>;

  const startEdit = (c: Criterion) => {
    setEditingId(c.id);
    setDraft({ type: c.type, description: c.description, is_essential: c.is_essential });
  };

  const saveEdit = async (criterionId: string) => {
    await updateCriterion.mutateAsync({ criterionId, payload: draft });
    setEditingId(null);
  };

  const handleAddCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCriterion.description.trim()) return;
    await addCriterion.mutateAsync(newCriterion);
    setNewCriterion({ type: 'other', description: '', is_essential: true });
    setAddingNew(false);
  };

  const handleStartScreening = async (force = false) => {
    setScreeningError(null);
    setRunId(null);
    try {
      const result = await startScreening.mutateAsync(force);
      setRunId(result.id);
    } catch (err: any) {
      setScreeningError(err?.detail || err?.message || 'Screening failed. Check the backend logs.');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-black text-2xl text-foreground tracking-tight">{profile.title}</h1>
          <p className="text-xs text-muted font-medium mt-1">
            {profile.method_of_recruitment || 'Job profile'}
            {profile.pay_scale ? ` · ${profile.pay_scale}` : ''}
          </p>
        </div>
        <Link
          to={`/reports/${profile.id}`}
          className="bg-card border border-border font-bold text-xs px-5 py-3 rounded-2xl flex items-center gap-2 text-foreground hover:border-primary/40"
        >
          <BarChart3 className="w-4 h-4 text-primary" />
          View Results
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Criteria editor */}
        <div className="xl:col-span-7 bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Edit2 className="w-4.5 h-4.5 text-primary" />
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Criteria</h2>
            </div>
            <button
              onClick={() => setAddingNew((v) => !v)}
              className="text-[11px] font-bold text-primary flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add criterion
            </button>
          </div>

          {profile.base_age_min != null && (
            <div className="text-[11px] font-semibold text-muted bg-accent/50 rounded-xl px-3 py-2">
              Base age range: {profile.base_age_min}–{profile.base_age_max}
              {profile.age_relaxation_rules.length > 0 &&
                ` · ${profile.age_relaxation_rules.length} category relaxation rule(s) apply automatically`}
            </div>
          )}

          {addingNew && (
            <form onSubmit={handleAddCriterion} className="flex flex-col gap-3 bg-accent/40 rounded-2xl p-4">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newCriterion.type}
                  onChange={(e) => setNewCriterion((c) => ({ ...c, type: e.target.value }))}
                  className="bg-card border border-border text-foreground text-xs font-bold p-2.5 rounded-xl"
                >
                  {CRITERION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <input
                    type="checkbox"
                    checked={newCriterion.is_essential}
                    onChange={(e) => setNewCriterion((c) => ({ ...c, is_essential: e.target.checked }))}
                  />
                  Essential
                </label>
              </div>
              <textarea
                value={newCriterion.description}
                onChange={(e) => setNewCriterion((c) => ({ ...c, description: e.target.value }))}
                placeholder="Describe the criterion…"
                required
                className="bg-card border border-border text-foreground text-xs font-medium p-3 rounded-xl w-full min-h-[60px]"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setAddingNew(false)}
                  className="text-xs font-bold px-4 py-2 rounded-xl border border-border text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addCriterion.isPending}
                  className="text-xs font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground"
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
                <div key={c.id} className="border border-border rounded-2xl p-4">
                  {editingId === c.id ? (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={draft.type}
                          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                          className="bg-accent/40 border border-border text-foreground text-xs font-bold p-2 rounded-xl"
                        >
                          {CRITERION_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-xs font-bold text-foreground">
                          <input
                            type="checkbox"
                            checked={!!draft.is_essential}
                            onChange={(e) => setDraft((d) => ({ ...d, is_essential: e.target.checked }))}
                          />
                          Essential
                        </label>
                      </div>
                      <textarea
                        value={draft.description}
                        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                        className="bg-accent/40 border border-border text-foreground text-xs font-medium p-2.5 rounded-xl w-full min-h-[50px]"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(c.id)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground flex items-center gap-1"
                        >
                          <Save className="w-3 h-3" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                            {c.type}
                          </span>
                          {c.is_essential && (
                            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-danger/10 text-danger rounded-full">
                              Essential
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-foreground">{c.description}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg border border-border">
                          <Edit2 className="w-3.5 h-3.5 text-muted" />
                        </button>
                        <button
                          onClick={() => deleteCriterion.mutate(c.id)}
                          className="p-1.5 rounded-lg border border-border"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-danger" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            {profile.criteria.length === 0 && (
              <p className="text-xs text-muted font-medium">No criteria yet — add one above.</p>
            )}
          </div>
        </div>

        {/* Candidates upload + screening */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          <CandidateUploadPanel profileId={profileId} />

          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4.5 h-4.5 text-primary" />
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Screening</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleStartScreening(false)}
                disabled={startScreening.isPending}
                className="flex-1 bg-primary text-primary-foreground font-bold text-xs py-3 rounded-2xl disabled:opacity-50"
              >
                Screen New Candidates
              </button>
              <button
                onClick={() => handleStartScreening(true)}
                disabled={startScreening.isPending}
                className="flex-1 bg-accent text-accent-foreground font-bold text-xs py-3 rounded-2xl border border-border disabled:opacity-50"
              >
                Re-screen All
              </button>
            </div>
            {screeningError && (
              <p className="text-[11px] font-semibold text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">
                {screeningError}
              </p>
            )}
            {run && run.total_candidates === 0 && (
              <p className="text-[11px] font-semibold text-muted">
                No candidates to screen — upload candidates first, or use Re-screen All to re-evaluate existing ones.
              </p>
            )}
            {run && run.total_candidates > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                  <span>
                    {run.processed_count}/{run.total_candidates} processed
                    {run.failed_count > 0 ? ` · ${run.failed_count} failed` : ''}
                  </span>
                  <StatusBadge status={run.status} />
                </div>
                <div className="h-2 bg-accent rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${(run.processed_count / run.total_candidates) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4.5 h-4.5 text-primary" />
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Document Verification</h2>
            </div>
            <button
              onClick={() => batchVerification.mutate()}
              disabled={batchVerification.isPending}
              className="w-full bg-primary text-primary-foreground font-bold text-xs py-3 rounded-2xl disabled:opacity-50"
            >
              {batchVerification.isPending ? 'Verifying…' : 'Verify All Eligible'}
            </button>
            {batchVerification.data && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                  <span>
                    {batchVerification.data.verified_count}/{batchVerification.data.total_eligible} verified
                    {batchVerification.data.failed_count > 0 ? ` · ${batchVerification.data.failed_count} failed` : ''}
                  </span>
                  <StatusBadge status={batchVerification.data.status} />
                </div>
                <div className="h-2 bg-accent rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success transition-all"
                    style={{
                      width: `${batchVerification.data.total_eligible ? (batchVerification.data.verified_count / batchVerification.data.total_eligible) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Candidate list */}
      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Candidates</h2>
          <div className="flex items-center gap-2">
            {candidates && candidates.length > 0 && (
              <span className="text-[10px] font-extrabold px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full">
                {candidates.length} total
              </span>
            )}
            {candidates && candidates.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm(`Remove all ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} from this profile? This cannot be undone.`)) {
                    resetCandidates.mutate();
                  }
                }}
                disabled={resetCandidates.isPending}
                title="Reset — delete all candidates and start fresh"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-danger bg-danger/10 border border-danger/20 hover:bg-danger/20 disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                {resetCandidates.isPending ? 'Resetting…' : 'Reset'}
              </button>
            )}
          </div>
        </div>

        {candidatesLoading && (
          <div className="px-6 py-8 flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse bg-border/40 rounded-xl" />
            ))}
          </div>
        )}

        {!candidatesLoading && candidates && candidates.length === 0 && (
          <div className="px-6 py-10 text-center flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-accent border border-border flex items-center justify-center">
              <Users className="w-5 h-5 text-muted" />
            </div>
            <p className="text-sm font-bold text-foreground">No candidates yet</p>
            <p className="text-xs text-muted font-medium">Upload the candidate roster and documents ZIP above to get started.</p>
          </div>
        )}

        {!candidatesLoading && candidates && candidates.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent/60 border-b border-border text-left">
                  <th className="py-3 px-5 text-[10px] font-black uppercase tracking-widest text-muted">Candidate</th>
                  <th className="py-3 px-5 text-[10px] font-black uppercase tracking-widest text-muted">Email</th>
                  <th className="py-3 px-5 text-[10px] font-black uppercase tracking-widest text-muted">Documents</th>
                  <th className="py-3 px-5 text-[10px] font-black uppercase tracking-widest text-muted">Status</th>
                  <th className="py-3 px-5" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={c.id} className={`border-b border-border/60 hover:bg-accent/40 transition-colors ${i % 2 !== 0 ? 'bg-accent/20' : ''}`}>
                    <td className="py-3 px-5 font-bold text-foreground">{c.name || c.external_id}</td>
                    <td className="py-3 px-5 font-medium text-muted">{c.email || '—'}</td>
                    <td className="py-3 px-5"><StatusBadge status={c.ingestion_status} /></td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={c.status} />
                        {c.status_overridden && (
                          <span className="text-[9px] font-bold text-warning bg-warning/10 border border-warning/20 rounded-full px-1.5 py-0.5">edited</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <Link to={`/candidate/${profile.id}/${c.id}`} className="text-[11px] font-bold text-primary hover:underline">
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileDetailPage;
