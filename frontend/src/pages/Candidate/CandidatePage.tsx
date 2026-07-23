import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileCheck2, ShieldCheck, User, Mail, Calendar, Tag, CheckCircle2, XCircle, HelpCircle, BookOpen, PlayCircle, Phone } from 'lucide-react';
import { useCandidateReview, useOverrideStatus } from '../../hooks/useReview';
import { useEvaluateCandidate } from '../../hooks/useScreening';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime, formatDate } from '../../lib/format';

const OVERRIDE_OPTIONS = ['eligible', 'not_eligible', 'needs_review'] as const;

const RESULT_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />,
  fail: <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />,
  needs_review: <HelpCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />,
};

export const CandidatePage: React.FC = () => {
  const { profileId, candidateId } = useParams<{ profileId: string; candidateId: string }>();
  const { data: review, isLoading } = useCandidateReview(profileId, candidateId);
  const overrideStatus = useOverrideStatus(profileId, candidateId);
  const evaluateCandidate = useEvaluateCandidate(profileId);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<(typeof OVERRIDE_OPTIONS)[number]>('eligible');
  const [reason, setReason] = useState('');
  const [screenError, setScreenError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 max-w-4xl">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse bg-border/40 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!review) return <p className="text-sm font-semibold text-danger">Candidate not found.</p>;

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    await overrideStatus.mutateAsync({ new_status: newStatus, reason });
    setOverrideOpen(false);
    setReason('');
  };

  const handleScreen = async () => {
    if (!candidateId) return;
    setScreenError(null);
    try {
      await evaluateCandidate.mutateAsync(candidateId);
    } catch (err: any) {
      setScreenError(err?.detail || err?.message || 'Screening failed. Check the backend logs.');
    }
  };

  const passCount = review.evaluations.filter(e => e.result === 'pass').length;
  const failCount = review.evaluations.filter(e => e.result === 'fail').length;
  const reviewCount = review.evaluations.filter(e => e.result === 'needs_review').length;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Back + header */}
      <div>
        <Link to={`/recruitment/${profileId}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted hover:text-primary transition-colors mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to job profile
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-black text-2xl text-foreground tracking-tight">{review.name || 'Unnamed Candidate'}</h1>
            <p className="text-sm text-muted font-medium mt-1">{review.email || '—'}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={review.status} className="text-xs px-3 py-1.5" />
            {review.status_overridden && (
              <span className="text-[10px] font-semibold text-warning bg-warning/10 border border-warning/20 rounded-full px-2 py-0.5">
                Overridden · {formatDateTime(review.overridden_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleScreen}
          disabled={evaluateCandidate.isPending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          <PlayCircle className="w-4 h-4" />
          {evaluateCandidate.isPending ? 'Screening…' : 'Screen this Candidate'}
        </button>
        <Link
          to={`/document-verifier/${profileId}/${candidateId}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-card border border-border text-foreground hover:border-primary/40 hover:text-primary transition-all"
        >
          <FileCheck2 className="w-4 h-4" />
          Cross-check Documents
        </Link>
        <button
          onClick={() => setOverrideOpen(v => !v)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            overrideOpen
              ? 'bg-accent border border-border text-foreground'
              : 'bg-card border border-border text-foreground hover:border-primary/40 hover:text-primary'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Override Status
        </button>
      </div>

      {/* Screen error */}
      {screenError && (
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-xl text-xs font-semibold">
          {screenError}
        </div>
      )}

      {/* Override panel */}
      {overrideOpen && (
        <form onSubmit={handleOverride} className="bg-accent/50 border border-border rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-xs font-black text-foreground uppercase tracking-wider">Set new status</p>
          <div className="flex gap-2 flex-wrap">
            {OVERRIDE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setNewStatus(opt)}
                className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all ${
                  newStatus === opt
                    ? opt === 'eligible' ? 'bg-success text-white border-success'
                    : opt === 'not_eligible' ? 'bg-danger text-white border-danger'
                    : 'bg-warning text-white border-warning'
                    : 'border-border text-muted hover:text-foreground hover:border-primary/40'
                }`}
              >
                {opt.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for override (recommended — kept in the audit trail)…"
            className="bg-card border border-border text-foreground text-xs font-medium p-3 rounded-xl w-full min-h-[70px] focus:outline-none focus:border-primary transition-colors resize-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOverrideOpen(false)} className="text-xs font-bold px-4 py-2 rounded-xl border border-border text-muted hover:text-foreground transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={overrideStatus.isPending} className="text-xs font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-60 hover:opacity-90 transition-opacity">
              {overrideStatus.isPending ? 'Saving…' : 'Confirm Override'}
            </button>
          </div>
        </form>
      )}

      {/* Candidate personal details */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-bold text-sm text-foreground">Candidate Details</h2>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          {review.email && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted flex items-center gap-1 mb-0.5">
                <Mail className="w-3 h-3" /> Email
              </dt>
              <dd className="text-xs font-semibold text-foreground break-all">{review.email}</dd>
            </div>
          )}
          {review.phone && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted flex items-center gap-1 mb-0.5">
                <Phone className="w-3 h-3" /> Phone
              </dt>
              <dd className="text-xs font-semibold text-foreground">{review.phone}</dd>
            </div>
          )}
          {review.dob && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted flex items-center gap-1 mb-0.5">
                <Calendar className="w-3 h-3" /> Date of Birth
              </dt>
              <dd className="text-xs font-semibold text-foreground">{formatDate(review.dob)}</dd>
            </div>
          )}
          {review.gender && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted flex items-center gap-1 mb-0.5">
                <User className="w-3 h-3" /> Gender
              </dt>
              <dd className="text-xs font-semibold text-foreground">{review.gender}</dd>
            </div>
          )}
          {review.normalized_category && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted flex items-center gap-1 mb-0.5">
                <Tag className="w-3 h-3" /> Category
              </dt>
              <dd className="text-xs font-semibold text-foreground">
                {review.normalized_category}
                {review.raw_category && review.raw_category !== review.normalized_category && (
                  <span className="text-muted font-medium"> ({review.raw_category})</span>
                )}
              </dd>
            </div>
          )}
          {review.ingestion_status && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted mb-0.5">Documents</dt>
              <dd><StatusBadge status={review.ingestion_status} /></dd>
            </div>
          )}
          {review.computed_status && review.status_overridden && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted mb-0.5">AI Decision</dt>
              <dd><StatusBadge status={review.computed_status} /></dd>
            </div>
          )}
        </dl>
      </div>

      {/* Evaluation summary bar */}
      {review.evaluations.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-success/10 border border-success/20 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <div>
              <p className="text-xl font-black text-success">{passCount}</p>
              <p className="text-[10px] font-bold text-success/70 uppercase tracking-wider">Passed</p>
            </div>
          </div>
          <div className="bg-danger/10 border border-danger/20 rounded-2xl p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-danger shrink-0" />
            <div>
              <p className="text-xl font-black text-danger">{failCount}</p>
              <p className="text-[10px] font-bold text-danger/70 uppercase tracking-wider">Failed</p>
            </div>
          </div>
          <div className="bg-warning/10 border border-warning/20 rounded-2xl p-4 flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-warning shrink-0" />
            <div>
              <p className="text-xl font-black text-warning">{reviewCount}</p>
              <p className="text-[10px] font-bold text-warning/70 uppercase tracking-wider">Review</p>
            </div>
          </div>
        </div>
      )}

      {/* Criterion evaluations */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-bold text-sm text-foreground">Criterion Evaluations</h2>
        </div>

        {review.evaluations.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-accent border border-border flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-muted" />
            </div>
            <p className="text-xs font-bold text-foreground">Not screened yet</p>
            <p className="text-[11px] text-muted font-medium">Run screening from the job profile page to evaluate this candidate.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {review.evaluations.map((ev) => (
              <div
                key={ev.criterion_id}
                className={`border rounded-2xl p-4 flex flex-col gap-2 transition-colors ${
                  ev.result === 'pass' ? 'border-success/20 bg-success/5'
                  : ev.result === 'fail' ? 'border-danger/20 bg-danger/5'
                  : 'border-warning/20 bg-warning/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {RESULT_ICON[ev.result] ?? RESULT_ICON['needs_review']}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-primary/10 text-primary rounded-full">{ev.criterion_type}</span>
                        {ev.is_essential && (
                          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-danger/10 text-danger rounded-full">Essential</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-foreground">{ev.criterion_description}</p>
                    </div>
                  </div>
                  <StatusBadge status={ev.result} />
                </div>
                {ev.reasoning && (
                  <p className="text-[11px] text-muted font-medium leading-relaxed pl-6">{ev.reasoning}</p>
                )}
                {(ev.citation_document || ev.citation_page) && (
                  <p className="text-[10px] font-bold text-primary pl-6">
                    Source: {ev.citation_document || 'document'}{ev.citation_page ? `, page ${ev.citation_page}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CandidatePage;
