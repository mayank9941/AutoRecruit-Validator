import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import GlassCard from "../../components/GlassCard/GlassCard";
import Badge from "../../components/Badge/Badge";
import { useJobProfile } from "../../hooks/useJobProfile";
import { useResults } from "../../hooks/useResults";
import { BASE_URL } from "../../lib/api";
import "./Results.css";

const STATUS_TABS = [
  { key: null, label: "All" },
  { key: "eligible", label: "Eligible" },
  { key: "not_eligible", label: "Not Eligible" },
  { key: "needs_review", label: "Needs Review" },
  { key: "not_evaluated", label: "Not Evaluated" },
];

export default function Results() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { data: profile } = useJobProfile(profileId);
  const [statusFilter, setStatusFilter] = useState(null);
  const { data, isLoading, isError, error } = useResults(profileId, statusFilter);

  const exportUrl = `${BASE_URL}/jd/profiles/${profileId}/results/export${
    statusFilter ? `?status=${statusFilter}` : ""
  }`;

  return (
    <div className="results-page">
      <Link to={`/profiles/${profileId}`} className="back-link">
        ← {profile?.title || "Back to profile"}
      </Link>

      <header className="results-header">
        <h1>Results</h1>
        <p className="text-soft">Screening outcomes for every candidate, sorted with Eligible first.</p>
      </header>

      {data && (
        <GlassCard className="results-summary">
          <div className="results-summary-stat">
            <span className="results-summary-value">{data.summary.total}</span>
            <span className="text-dim">Total</span>
          </div>
          <div className="results-summary-stat">
            <span className="results-summary-value">{data.summary.eligible}</span>
            <Badge status="eligible" />
          </div>
          <div className="results-summary-stat">
            <span className="results-summary-value">{data.summary.not_eligible}</span>
            <Badge status="not_eligible" />
          </div>
          <div className="results-summary-stat">
            <span className="results-summary-value">{data.summary.needs_review}</span>
            <Badge status="needs_review" />
          </div>
          <div className="results-summary-stat">
            <span className="results-summary-value">{data.summary.not_evaluated}</span>
            <Badge status="not_evaluated" />
          </div>
        </GlassCard>
      )}

      <div className="results-toolbar">
        <div className="results-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              className={`results-tab ${statusFilter === tab.key ? "active" : ""}`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <a href={exportUrl} className="results-export-link">
          Export to Excel ↓
        </a>
      </div>

      {isLoading && <p className="text-soft">Loading results…</p>}
      {isError && <p className="upload-error">Couldn't load results: {error.detail || error.message}</p>}

      {data && data.candidates.length === 0 && (
        <GlassCard>
          <p className="text-dim">No candidates match this filter yet.</p>
        </GlassCard>
      )}

      {data && data.candidates.length > 0 && (
        <GlassCard className="data-table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c) => (
                <tr
                  key={c.id}
                  className="clickable-row"
                  onClick={() => navigate(`/profiles/${profileId}/candidates/${c.id}/review`)}
                >
                  <td>
                    <div className="candidate-name">{c.name || "—"}</div>
                    <div className="candidate-id text-dim">{c.external_id}</div>
                  </td>
                  <td className="text-soft">{c.email || "—"}</td>
                  <td className="text-soft">{c.phone || "—"}</td>
                  <td>
                    <Badge status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}
