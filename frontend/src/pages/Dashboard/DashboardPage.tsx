import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Briefcase, FileText, PlayCircle, ArrowUpRight, CheckCircle2, XCircle, Clock, HelpCircle } from 'lucide-react';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';

// Skeleton shimmer block
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-xl bg-border/60 ${className}`} />
);

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-3xl p-6 flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {[7, 5].map((span, i) => (
          <div key={i} className={`xl:col-span-${span} bg-card border border-border rounded-3xl p-6 flex flex-col gap-4`}>
            <Skeleton className="h-4 w-32" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="py-3 flex items-center gap-3 border-b border-border/50">
                <div className="flex-1"><Skeleton className="h-3 w-full mb-1.5" /><Skeleton className="h-2.5 w-24" /></div>
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const STAT_CONFIG = [
  { key: 'total_job_profiles', label: 'Job Profiles', icon: Briefcase, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', isTotal: true },
  { key: 'eligible', label: 'Eligible', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  { key: 'needs_review', label: 'Needs Review', icon: HelpCircle, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  { key: 'not_eligible', label: 'Not Eligible', icon: XCircle, color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/20' },
  { key: 'total_candidates', label: 'Total Candidates', icon: Users, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', isTotal: true },
  { key: 'not_evaluated', label: 'Not Evaluated', icon: Clock, color: 'text-muted', bg: 'bg-muted/10', border: 'border-border' },
];

export const DashboardPage: React.FC = () => {
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="p-5 bg-danger/10 border border-danger/20 text-danger rounded-2xl text-sm font-semibold flex items-start gap-3">
        <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-black">Failed to load dashboard</p>
          <p className="font-medium mt-0.5 text-xs opacity-80">{(error as Error)?.message || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const summary = data!;

  const statValues: Record<string, number> = {
    total_job_profiles: summary.total_job_profiles,
    total_candidates: summary.total_candidates,
    eligible: summary.candidates_by_status.eligible ?? 0,
    needs_review: summary.candidates_by_status.needs_review ?? 0,
    not_eligible: summary.candidates_by_status.not_eligible ?? 0,
    not_evaluated: summary.candidates_by_status.not_evaluated ?? 0,
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {STAT_CONFIG.map(({ key, label, icon: Icon, color, bg, border }) => (
          <div key={key} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">
            <div className={`w-8 h-8 rounded-xl ${bg} border ${border} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
              <p className={`text-2xl font-black mt-0.5 ${color}`}>{statValues[key]}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Recent JD Uploads */}
        <div className="xl:col-span-6 bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <h2 className="font-bold text-sm text-foreground">Recent JD Uploads</h2>
            </div>
            <Link to="/recruitment" className="text-[11px] font-bold text-primary flex items-center gap-1 hover:gap-1.5 transition-all">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          {summary.recent_jd_uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <div className="w-10 h-10 rounded-2xl bg-accent border border-border flex items-center justify-center">
                <FileText className="w-5 h-5 text-muted" />
              </div>
              <p className="text-xs font-bold text-foreground">No JDs uploaded yet</p>
              <p className="text-[11px] text-muted font-medium">Upload a JD PDF from the Job Profiles page to get started.</p>
              <Link to="/recruitment" className="mt-1 text-[11px] font-bold text-primary hover:underline">Go to Job Profiles →</Link>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {summary.recent_jd_uploads.map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{u.filename}</p>
                    <p className="text-[11px] text-muted font-medium mt-0.5">{formatDateTime(u.uploaded_at)}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-extrabold px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full">
                    {u.post_count} post{u.post_count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Screening Runs */}
        <div className="xl:col-span-6 bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <PlayCircle className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-bold text-sm text-foreground">Recent Screening Runs</h2>
          </div>

          {summary.recent_screening_runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <div className="w-10 h-10 rounded-2xl bg-accent border border-border flex items-center justify-center">
                <PlayCircle className="w-5 h-5 text-muted" />
              </div>
              <p className="text-xs font-bold text-foreground">No screening runs yet</p>
              <p className="text-[11px] text-muted font-medium">Upload candidates to a job profile and run screening to see results here.</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {summary.recent_screening_runs.map((r) => (
                <Link
                  key={r.id}
                  to={`/recruitment/${r.job_profile_id}`}
                  className="py-3 flex items-center justify-between gap-3 hover:opacity-75 transition-opacity"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{r.job_profile_title}</p>
                    <p className="text-[11px] text-muted font-medium mt-0.5">
                      {r.processed_count}/{r.total_candidates} processed
                      {r.failed_count > 0 && <span className="text-danger"> · {r.failed_count} failed</span>}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
