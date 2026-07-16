import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import GlassCard from "../../components/GlassCard/GlassCard";
import Button from "../../components/Button/Button";
import Badge from "../../components/Badge/Badge";
import ProgressBar from "../../components/ProgressBar/ProgressBar";
import { useJobProfile } from "../../hooks/useJobProfile";
import { useCandidates, useUploadCandidates } from "../../hooks/useCandidates";
import { useStartScreening, useScreeningRun } from "../../hooks/useScreening";
import "./Candidates.css";

const INGESTION_LABEL = {
  documents_complete: { label: "Documents complete", variant: "up" },
  documents_incomplete: { label: "Documents incomplete", variant: "pending" },
  no_documents_found: { label: "No documents found", variant: "down" },
  corrupt_zip: { label: "Corrupt ZIP", variant: "down" },
  excel_row_not_found: { label: "Excel row not found", variant: "down" },
};

function IngestionBadge({ status }) {
  const mapped = INGESTION_LABEL[status] || { label: status, variant: "neutral" };
  return <Badge variant={mapped.variant}>{mapped.label}</Badge>;
}

export default function CandidatesPage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useJobProfile(profileId);
  const { data: candidates, isLoading, isError, error } = useCandidates(profileId);
  const uploadCandidates = useUploadCandidates(profileId);

  const [excelFile, setExcelFile] = useState(null);
  const [masterZipFile, setMasterZipFile] = useState(null);

  const [activeRunId, setActiveRunId] = useState(null);
  const startScreening = useStartScreening(profileId);
  const { data: run } = useScreeningRun(profileId, activeRunId);

  // Once the run finishes, refetch the candidates list so their statuses
  // (Eligible/Not Eligible/Needs Review/Not Evaluated) reflect the result.
  useEffect(() => {
    if (run?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["candidates", profileId] });
    }
  }, [run?.status, profileId, queryClient]);

  function handleUpload() {
    if (!excelFile || !masterZipFile) return;
    uploadCandidates.mutate({ excelFile, masterZipFile });
  }

  function handleRunScreening(force = false) {
    startScreening.mutate(force, {
      onSuccess: (data) => setActiveRunId(data.id),
    });
  }

  return (
    <div className="candidates-page">
      <Link to={`/profiles/${profileId}`} className="back-link">
        ← {profile?.title || "Back to profile"}
      </Link>

      <header className="candidates-header">
        <h1>Candidates</h1>
        <p className="text-soft">
          Upload the candidate master data file and the master ZIP (containing one nested ZIP per
          candidate) to add candidates for screening against this profile.
        </p>
      </header>

      <GlassCard className="upload-card">
        <div className="upload-fields">
          <FilePickerField
            label="Candidate master data (Excel/.xls)"
            file={excelFile}
            onChange={setExcelFile}
            accept=".xls,.xlsx,.csv"
          />
          <FilePickerField
            label="Master ZIP (one nested ZIP per candidate)"
            file={masterZipFile}
            onChange={setMasterZipFile}
            accept=".zip"
          />
        </div>

        <Button
          variant="primary"
          onClick={handleUpload}
          disabled={!excelFile || !masterZipFile || uploadCandidates.isPending}
        >
          {uploadCandidates.isPending ? "Uploading & matching…" : "Upload Candidates"}
        </Button>

        {uploadCandidates.isError && (
          <p className="upload-error">
            Upload failed: {uploadCandidates.error.detail || uploadCandidates.error.message}
          </p>
        )}

        {uploadCandidates.isSuccess && <UploadResultSummary result={uploadCandidates.data} />}
      </GlassCard>

      <GlassCard className="screening-card">
        <div className="screening-row">
          <div>
            <h2 className="section-title">Screening</h2>
            <p className="text-soft screening-description">
              Screens every candidate still marked "Not Evaluated" against this profile's criteria.
            </p>
          </div>
          <div className="screening-actions">
            <Button
              variant="primary"
              onClick={() => handleRunScreening(false)}
              disabled={startScreening.isPending || run?.status === "running"}
            >
              {run?.status === "running" ? "Screening…" : "Run Screening"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleRunScreening(true)}
              disabled={startScreening.isPending || run?.status === "running"}
            >
              Re-screen all
            </Button>
            <Link to={`/profiles/${profileId}/results`}>
              <Button variant="glass">View Results →</Button>
            </Link>
          </div>
        </div>

        {startScreening.isError && (
          <p className="upload-error">
            Couldn't start screening: {startScreening.error.detail || startScreening.error.message}
          </p>
        )}

        {run && (
          <div className="screening-progress">
            <ProgressBar value={run.processed_count} max={run.total_candidates} />
            <div className="screening-progress-meta text-dim">
              <span>
                {run.processed_count} of {run.total_candidates} processed
                {run.failed_count > 0 && ` · ${run.failed_count} failed`}
              </span>
              <span>{run.status === "running" ? "Running…" : "Completed"}</span>
            </div>
          </div>
        )}
      </GlassCard>

      <section>
        <h2 className="section-title">
          All Candidates {candidates ? `(${candidates.length})` : ""}
        </h2>

        {isLoading && <p className="text-soft">Loading candidates…</p>}
        {isError && <p className="upload-error">Couldn't load candidates: {error.detail || error.message}</p>}

        {candidates && candidates.length === 0 && (
          <GlassCard>
            <p className="text-dim">No candidates uploaded yet -- upload above to add some.</p>
          </GlassCard>
        )}

        {candidates && candidates.length > 0 && (
          <GlassCard className="data-table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Documents</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr
                    key={c.id}
                    className="clickable-row"
                    onClick={() => navigate(`/profiles/${profileId}/candidates/${c.id}/review`)}
                  >
                    <td>
                      <div className="candidate-name">{c.name || "—"}</div>
                      <div className="candidate-id text-dim">{c.external_id}</div>
                    </td>
                    <td className="text-soft">{c.normalized_category || "—"}</td>
                    <td>
                      <IngestionBadge status={c.ingestion_status} />
                    </td>
                    <td>
                      <Badge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}
      </section>
    </div>
  );
}

function FilePickerField({ label, file, onChange, accept }) {
  const id = `file-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="file-picker-field">
      <label className="file-picker-label-text">{label}</label>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="upload-file-input"
      />
      <label htmlFor={id} className="upload-file-label">
        {file ? file.name : "Choose a file…"}
      </label>
    </div>
  );
}

function UploadResultSummary({ result }) {
  return (
    <div className="upload-result">
      <p className="upload-success-note">
        Found {result.total_candidates_found} candidate{result.total_candidates_found === 1 ? "" : "s"} in
        the master ZIP.
      </p>
      <ul className="upload-list">
        <li>{result.documents_complete} with complete documents</li>
        {result.documents_incomplete > 0 && <li>{result.documents_incomplete} with incomplete documents</li>}
        {result.no_documents_found > 0 && <li>{result.no_documents_found} with no documents found</li>}
        {result.excel_row_not_found > 0 && <li>{result.excel_row_not_found} with no matching Excel row</li>}
        {result.corrupt_zip > 0 && <li>{result.corrupt_zip} with a corrupt nested ZIP</li>}
      </ul>
    </div>
  );
}
