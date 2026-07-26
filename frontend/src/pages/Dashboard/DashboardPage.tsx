import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Briefcase, FileText, PlayCircle, ArrowUpRight, CheckCircle2, XCircle, Clock, HelpCircle } from 'lucide-react';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';

// Skeleton shimmer block
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-border/60 ${className}`} />
);

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-6 flex flex-col gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {[7, 5].map((span, i) => (
          <div key={i} className={`xl:col-span-${span} bg-card border border-border rounded-lg p-6 flex flex-col gap-4`}>
            <Skeleton className="h-4 w-32" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="py-3 flex items-center gap-3 border-b border-border/50">
                <div className="flex-1"><Skeleton className="h-3 w-full mb-1.5" /><Skeleton className="h-2.5 w-24" /></div>
                <Skeleton className="h-5 w-12 rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Primary (hero) stats — the numbers HR cares about most
const HERO_STAT_CONFIG = [
  { key: 'total_candidates', label: 'Total candidates', icon: Users, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
  { key: 'eligible', label: 'Eligible candidates', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
];

// Secondary stats — quieter, smaller
const SECONDARY_STAT_CONFIG = [
  { key: 'needs_review', label: 'Needs review', icon: HelpCircle, color: 'text-warning' },
  { key: 'not_eligible', label: 'Not eligible', icon: XCircle, color: 'text-danger' },
  { key: 'not_evaluated', label: 'Not screened yet', icon: Clock, color: 'text-muted' },
  { key: 'total_job_profiles', label: 'Job profiles', icon: Briefcase, color: 'text-primary' },
];

export const DashboardPage: React.FC = () => {
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="p-5 bg-danger/10 border border-danger/20 text-danger rounded-lg text-sm font-semibold flex items-start gap-3">
        <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Could not load the dashboard</p>
          <p className="font-normal mt-0.5 text-sm opacity-80">{(error as Error)?.message || 'Unknown error'}</p>
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
      {/* Hero stats — the two numbers that matter most */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {HERO_STAT_CONFIG.map(({ key, label, icon: Icon, color, bg, border }) => (
          <div key={key} className="bg-card border border-border rounded-lg p-6 flex items-center gap-5">
            <div className={`w-12 h-12 rounded-lg ${bg} border ${border} flex items-center justify-center shrink-0`}>
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div>
              <p className={`text-5xl font-bold ${color}`}>{statValues[key]}</p>
              <p className="text-base font-medium text-foreground mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary stats — quieter row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {SECONDARY_STAT_CONFIG.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color} shrink-0`} />
            <div>
              <p className="text-xl font-bold text-foreground">{statValues[key]}</p>
              <p className="text-sm font-normal text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Recent JD Uploads */}
        <div className="xl:col-span-6 bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <h2 className="font-semibold text-base text-foreground">Recent JD uploads</h2>
            </div>
            <Link to="/recruitment" className="text-sm font-semibold text-primary flex items-center gap-1 hover:underline">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {summary.recent_jd_uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <div className="w-10 h-10 rounded-lg bg-accent border border-border flex items-center justify-center">
                <FileText className="w-5 h-5 text-muted" />
              </div>
              <p className="text-sm font-semibold text-foreground">No JDs uploaded yet</p>
              <p className="text-sm text-muted font-normal">Upload a JD PDF from the Job Profiles page to get started.</p>
              <Link to="/recruitment" className="mt-1 text-sm font-semibold text-primary hover:underline">Go to Job Profiles →</Link>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {summary.recent_jd_uploads.map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{u.filename}</p>
                    <p className="text-sm text-muted font-normal mt-0.5">{formatDateTime(u.uploaded_at)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-md">
                    {u.post_count} post{u.post_count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Screening Runs */}
        <div className="xl:col-span-6 bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <PlayCircle className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base text-foreground">Recent screening runs</h2>
          </div>

          {summary.recent_screening_runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <div className="w-10 h-10 rounded-lg bg-accent border border-border flex items-center justify-center">
                <PlayCircle className="w-5 h-5 text-muted" />
              </div>
              <p className="text-sm font-semibold text-foreground">No screening runs yet</p>
              <p className="text-sm text-muted font-normal">Upload candidates to a job profile and run screening to see results here.</p>
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
                    <p className="text-sm font-semibold text-foreground truncate">{r.job_profile_title}</p>
                    <p className="text-sm text-muted font-normal mt-0.5">
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
