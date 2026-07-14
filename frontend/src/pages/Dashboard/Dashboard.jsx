import GlassCard from "../../components/GlassCard/GlassCard";
import Badge from "../../components/Badge/Badge";
import { useDashboardSummary } from "../../hooks/useDashboard";
import { formatDateTime } from "../../lib/format";
import "./Dashboard.css";

export default function Dashboard() {
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (isLoading) {
    return <p className="text-soft">Loading dashboard…</p>;
  }

  if (isError) {
    return <p className="upload-error">Couldn't load the dashboard: {error.detail || error.message}</p>;
  }

  const { total_job_profiles, total_candidates, candidates_by_status, recent_jd_uploads, recent_screening_runs } =
    data;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="text-soft">An overview of every job profile and candidate in the system.</p>
      </header>

      <section className="dashboard-stats">
        <GlassCard className="stat-card">
          <div className="stat-value">{total_job_profiles}</div>
          <div className="stat-label text-dim">Job Profiles</div>
        </GlassCard>
        <GlassCard className="stat-card">
          <div className="stat-value">{total_candidates}</div>
          <div className="stat-label text-dim">Candidates</div>
        </GlassCard>
      </section>

      <section>
        <h2 className="section-title">Candidates by status</h2>
        <GlassCard className="status-breakdown">
          <Badge status="eligible" /> <span className="status-count">{candidates_by_status.eligible}</span>
          <Badge status="not_eligible" /> <span className="status-count">{candidates_by_status.not_eligible}</span>
          <Badge status="needs_review" /> <span className="status-count">{candidates_by_status.needs_review}</span>
          <Badge status="not_evaluated" /> <span className="status-count">{candidates_by_status.not_evaluated}</span>
        </GlassCard>
      </section>

      <section>
        <h2 className="section-title">Recent JD uploads</h2>
        <GlassCard>
          {recent_jd_uploads.length === 0 ? (
            <p className="text-dim">No JDs uploaded yet.</p>
          ) : (
            <ul className="dashboard-list">
              {recent_jd_uploads.map((upload) => (
                <li key={upload.id}>
                  <span className="dashboard-list-primary">{upload.filename}</span>
                  <span className="text-dim">
                    {upload.post_count} post{upload.post_count === 1 ? "" : "s"} · {formatDateTime(upload.uploaded_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </section>

      <section>
        <h2 className="section-title">Recent screening runs</h2>
        <GlassCard>
          {recent_screening_runs.length === 0 ? (
            <p className="text-dim">No screening runs yet.</p>
          ) : (
            <ul className="dashboard-list">
              {recent_screening_runs.map((run) => (
                <li key={run.id}>
                  <span className="dashboard-list-primary">{run.job_profile_title}</span>
                  <span className="text-dim">
                    {run.processed_count}/{run.total_candidates} processed
                    {run.failed_count > 0 && ` · ${run.failed_count} failed`} · {run.status} ·{" "}
                    {formatDateTime(run.started_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </section>
    </div>
  );
}
