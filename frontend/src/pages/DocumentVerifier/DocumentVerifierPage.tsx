import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileCheck2, RefreshCw, Check, X as XIcon, Pencil } from 'lucide-react';
import { useVerification, useRunVerification, useVerificationDecision } from '../../hooks/useVerification';
import { StatusBadge } from '../../components/StatusBadge';

export const DocumentVerifierPage: React.FC = () => {
  const { profileId, candidateId } = useParams<{ profileId?: string; candidateId?: string }>();

  if (!profileId || !candidateId) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-black text-2xl text-foreground tracking-tight">Document Verifier</h1>
          <p className="text-xs text-muted font-medium mt-1">
            Cross-checks what a candidate entered against what their uploaded documents actually say.
          </p>
        </div>
        <div className="bg-card border border-dashed border-border rounded-3xl p-10 text-center flex flex-col items-center gap-3">
          <FileCheck2 className="w-8 h-8 text-muted" />
          <p className="text-sm font-bold text-foreground">Pick a candidate to verify</p>
          <p className="text-xs text-muted font-medium max-w-sm">
            Open a job profile, then click "Review" on any candidate and choose "Cross-check documents" —
            or click "Cross-check documents" from a candidate's review page.
          </p>
          <Link to="/recruitment" className="text-[11px] font-bold text-primary mt-1">
            Go to Job Profiles →
          </Link>
        </div>
      </div>
    );
  }

  return <CandidateVerification profileId={profileId} candidateId={candidateId} />;
};

const CandidateVerification: React.FC<{ profileId: string; candidateId: string }> = ({ profileId, candidateId }) => {
  const { data, isLoading } = useVerification(profileId, candidateId);
  const runVerification = useRunVerification(profileId, candidateId);
  const decision = useVerificationDecision(profileId, candidateId);

  // Track which cards are in "re-edit" mode (keyed by verification id)
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const openEdit = (verificationId: string, existingNotes?: string | null) => {
    setNoteDrafts((d) => ({ ...d, [verificationId]: existingNotes || '' }));
    setEditingIds((s) => new Set(s).add(verificationId));
  };

  const closeEdit = (verificationId: string) => {
    setEditingIds((s) => {
      const next = new Set(s);
      next.delete(verificationId);
      return next;
    });
  };

  const handleDecision = (verificationId: string, dec: 'verified' | 'rejected') => {
    decision.mutate(
      { verificationId, decision: dec, notes: noteDrafts[verificationId] || undefined },
      { onSuccess: () => closeEdit(verificationId) },
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link
            to={`/candidate/${profileId}/${candidateId}`}
            className="text-[11px] font-bold text-primary flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to candidate review
          </Link>
          <h1 className="font-black text-2xl text-foreground tracking-tight">Document Verifier</h1>
        </div>
        <button
          onClick={() => runVerification.mutate()}
          disabled={runVerification.isPending}
          className="bg-primary text-primary-foreground font-bold text-xs px-4 py-2.5 rounded-2xl flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${runVerification.isPending ? 'animate-spin' : ''}`} />
          {runVerification.isPending ? 'Cross-checking…' : 'Run Cross-check'}
        </button>
      </div>

      {isLoading && <p className="text-sm font-semibold text-muted">Loading verification…</p>}

      {data?.skipped && (
        <div className="p-3 bg-warning/10 border border-warning/20 text-warning rounded-xl text-xs font-semibold">
          Verification skipped: {data.skip_reason || 'candidate documents unavailable'}
        </div>
      )}

      {data && !data.skipped && data.verifications.length === 0 && (
        <p className="text-xs text-muted font-medium">
          No verification results yet — click "Run Cross-check" to compare form data against uploaded documents.
        </p>
      )}

      {data && data.verifications.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.verifications.map((v) => {
            const isEditing = editingIds.has(v.id);
            const isPending = decision.isPending && (decision.variables as any)?.verificationId === v.id;

            return (
              <div key={v.id} className="bg-card border border-border rounded-3xl p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                      {v.source_document_type}
                    </span>
                    <p className="text-sm font-bold text-foreground mt-1">{v.field_name}</p>
                  </div>
                  <StatusBadge status={v.match_status} />
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Form Value</p>
                    <p className="font-semibold text-foreground">{v.form_value || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Extracted Value</p>
                    <p className="font-semibold text-foreground">{v.extracted_value || '—'}</p>
                    {v.extraction_confidence && (
                      <p className="text-[10px] text-muted font-medium mt-0.5">Confidence: {v.extraction_confidence}</p>
                    )}
                  </div>
                </div>

                {/* Decision footer */}
                <div className="border-t border-border pt-3">
                  {v.hr_decision && !isEditing ? (
                    /* Decided — show badge + re-edit button */
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                            v.hr_decision === 'verified'
                              ? 'bg-success/10 text-success border-success/20'
                              : 'bg-danger/10 text-danger border-danger/20'
                          }`}
                        >
                          {v.hr_decision}
                        </span>
                        <span className="text-[11px] text-muted font-medium">
                          by {v.verified_by || 'HR'}
                          {v.hr_notes ? ` — "${v.hr_notes}"` : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => openEdit(v.id, v.hr_notes)}
                        className="flex items-center gap-1 text-[11px] font-bold text-muted hover:text-primary transition-colors"
                        title="Change decision"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </div>
                  ) : (
                    /* No decision yet, or re-editing */
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Notes (optional)…"
                        value={noteDrafts[v.id] || ''}
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                        className="flex-1 bg-accent/40 border border-border text-foreground text-xs font-medium p-2 rounded-xl"
                      />
                      <button
                        onClick={() => handleDecision(v.id, 'verified')}
                        disabled={isPending}
                        className="p-2 rounded-lg bg-success/10 border border-success/20 text-success disabled:opacity-50"
                        title="Mark verified"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDecision(v.id, 'rejected')}
                        disabled={isPending}
                        className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger disabled:opacity-50"
                        title="Mark rejected"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                      {/* Only show Cancel when re-editing an already-decided item */}
                      {v.hr_decision && isEditing && (
                        <button
                          onClick={() => closeEdit(v.id)}
                          className="p-2 rounded-lg border border-border text-muted hover:text-foreground transition-colors"
                          title="Cancel"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DocumentVerifierPage;
