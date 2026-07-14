import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import GlassCard from "../../components/GlassCard/GlassCard";
import Button from "../../components/Button/Button";
import { useJobProfiles, useUploadJD } from "../../hooks/useJobProfiles";
import "./JobProfiles.css";

export default function JobProfiles() {
  const { data: profiles, isLoading, isError, error } = useJobProfiles();
  const uploadJD = useUploadJD();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    uploadJD.reset();
  }

  function handleUpload() {
    if (!selectedFile) return;
    uploadJD.mutate(selectedFile);
  }

  return (
    <div className="job-profiles">
      <header className="job-profiles-header">
        <h1>Job Profiles</h1>
        <p className="text-soft">
          Upload a JD PDF -- one or more Job Profiles are created automatically, based on how many
          posts the advertisement covers.
        </p>
      </header>

      <GlassCard className="upload-card">
        <div className="upload-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="upload-file-input"
            id="jd-file-input"
          />
          <label htmlFor="jd-file-input" className="upload-file-label">
            {selectedFile ? selectedFile.name : "Choose a JD PDF…"}
          </label>
          <Button variant="primary" onClick={handleUpload} disabled={!selectedFile || uploadJD.isPending}>
            {uploadJD.isPending ? "Uploading…" : "Upload JD"}
          </Button>
        </div>

        {uploadJD.isError && (
          <p className="upload-error">
            Upload failed: {uploadJD.error.detail || uploadJD.error.message}
          </p>
        )}

        {uploadJD.isSuccess && <UploadResultSummary result={uploadJD.data} />}
      </GlassCard>

      <section>
        <h2 className="section-title">All Job Profiles</h2>

        {isLoading && <p className="text-soft">Loading profiles…</p>}
        {isError && <p className="upload-error">Couldn't load profiles: {error.detail || error.message}</p>}

        {profiles && profiles.length === 0 && (
          <GlassCard>
            <p className="text-dim">No Job Profiles yet -- upload a JD above to create some.</p>
          </GlassCard>
        )}

        {profiles && profiles.length > 0 && (
          <div className="profiles-grid">
            {profiles.map((profile) => (
              <Link key={profile.id} to={`/profiles/${profile.id}`} className="profile-card-link">
                <GlassCard className="profile-card">
                  <h3 className="profile-title">{profile.title}</h3>
                  <div className="profile-meta text-dim">
                    {profile.method_of_recruitment && <span>{profile.method_of_recruitment}</span>}
                    {profile.pay_scale && <span>{profile.pay_scale}</span>}
                  </div>
                  <div className="profile-stats text-soft">
                    {profile.criteria.length} criteria
                    {profile.age_relaxation_rules.length > 0 &&
                      ` · ${profile.age_relaxation_rules.length} age relaxation rules`}
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function UploadResultSummary({ result }) {
  return (
    <div className="upload-result">
      {result.is_duplicate ? (
        <p className="upload-duplicate-note">{result.duplicate_message}</p>
      ) : (
        <p className="upload-success-note">
          Created {result.post_count} job profile{result.post_count === 1 ? "" : "s"} from{" "}
          <strong>{result.filename}</strong> (confidence: {result.parse_confidence}).
        </p>
      )}

      {result.validation_warnings.length > 0 && (
        <ul className="upload-list">
          {result.validation_warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
