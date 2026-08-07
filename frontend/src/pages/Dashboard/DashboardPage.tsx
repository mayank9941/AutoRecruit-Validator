import React from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle, XCircle } from 'lucide-react';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';

// Skeleton shimmer block
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-border/60 ${className}`} />
);

function DashboardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-6 flex flex-col gap-4">
      <Skeleton className="h-4 w-48" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="py-3 flex items-center gap-3 border-b border-border/50">
          <div className="flex-1">
            <Skeleton className="h-3 w-full mb-1.5" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
      ))}
    </div>
  );
}

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

  const runs = data!.recent_screening_runs;

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <PlayCircle className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-semibold text-base text-foreground">Previous screening runs</h2>
      </div>

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <div className="w-10 h-10 rounded-lg bg-accent border border-border flex items-center justify-center">
            <PlayCircle className="w-5 h-5 text-muted" />
          </div>
          <p className="text-sm font-semibold text-foreground">No screening runs yet</p>
          <p className="text-sm text-muted font-normal">
            Upload candidates to a job profile and run screening to see results here.
          </p>
          <Link to="/recruitment" className="mt-1 text-sm font-semibold text-primary hover:underline">
            Go to Job Profiles →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {runs.map((r) => (
            <Link
              key={r.id}
              to={`/recruitment/${r.job_profile_id}`}
              className="py-3 flex items-center justify-between gap-3 hover:opacity-75 transition-opacity"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{r.job_profile_title}</p>
                <p className="text-sm text-muted font-normal mt-0.5">
                  {formatDateTime(r.started_at)} · {r.processed_count}/{r.total_candidates} processed
                  {r.failed_count > 0 && <span className="text-danger"> · {r.failed_count} failed</span>}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
