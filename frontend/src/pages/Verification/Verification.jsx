import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import GlassCard from "../../components/GlassCard/GlassCard";
import Button from "../../components/Button/Button";
import Input from "../../components/Input/Input";
import Badge from "../../components/Badge/Badge";
import { useCandidateReview } from "../../hooks/useReview";
import { useVerification, useRunVerification, useVerificationDecision } from "../../hooks/useVerification";
import "./Verification.css";

const MATCH_STATUS_VARIANT = {
  matched: "up",
  mismatch: "down",
  low_confidence: "pending",
  extraction_failed: "neutral",
};

const FIELD_LABEL = {
  name: "Name",
  date_of_birth: "Date of Birth",
};

export default function Verification() {
  const { profileId, candidateId } = useParams();
  const { data: candidate } = useCandidateReview(profileId, candidateId);
  const { data: verification, isLoading, isError, error } = useVerification(profileId, candidateId);
  const runVerification = useRunVerification(profileId, candidateId);

  const isEligible = candidate?.status === "eligible";

  return (
    <div className="verification-page">
      <Link to={`/profiles/${profileId}/candidates/${candidateId}/review`} className="back-link">
        ← {candidate?.name || "Back to review"}
      </Link>

      <header className="verification-header">
        <div className="verification-header-top">
          <h1>Document Verification</h1>
          {candidate && <Badge status={candidate.status} />}
        </div>
        <p className="text-soft">
          Re-checks the candidate's name and date of birth against their 10th marksheet, and flags any
          mismatch or low-confidence extraction for manual review.
        </p>
      </header>

      {!isEligible && candidate && (
        <GlassCard>
          <p className="text-dim">
            Verification only applies to candidates who passed screening ("Eligible"). This candidate's
            current status is <Badge status={candidate.status} />.
          </p>
        </GlassCard>
      )}

      {isEligible && (
        <>
          <GlassCard className="verification-run-card">
            <Button variant="primary" onClick={() => runVerification.mutate()} disabled={runVerification.isPending}>
              {runVerification.isPending ? "Verifying…" : "Run Verification"}
            </Button>
            {runVerification.isError && (
              <p className="upload-error">
                {runVerification.error.detail || runVerification.error.message}
              </p>
            )}
          </GlassCard>

          {isLoading && <p className="text-soft">Loading verification results…</p>}
          {isError && <p className="upload-error">Couldn't load verification: {error.detail || error.message}</p>}

          {verification?.skipped && (
            <GlassCard>
              <p className="text-dim">{verification.skip_reason}</p>
            </GlassCard>
          )}

          {verification && verification.verifications.length > 0 && (
            <div className="verification-list">
              {verification.verifications.map((v) => (
                <VerificationRow key={v.id} profileId={profileId} candidateId={candidateId} record={v} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VerificationRow({ profileId, candidateId, record }) {
  const [decision, setDecision] = useState("verified");
  const [notes, setNotes] = useState("");
  const decideVerification = useVerificationDecision(profileId, candidateId);

  function handleSubmit(e) {
    e.preventDefault();
    decideVerification.mutate({ verificationId: record.id, decision, notes: notes || null });
  }

  return (
    <GlassCard className="verification-row">
      <div className="verification-row-main">
        <div className="verification-row-header">
          <span className="criterion-type">{FIELD_LABEL[record.field_name] || record.field_name}</span>
          <Badge variant={MATCH_STATUS_VARIANT[record.match_status] || "neutral"}>
            {record.match_status.replace("_", " ")}
          </Badge>
        </div>

        <div className="verification-compare">
          <div>
            <span className="text-dim verification-compare-label">Form value</span>
            <p>{record.form_value || "—"}</p>
          </div>
          <div>
            <span className="text-dim verification-compare-label">
              Extracted from {record.source_document_type.replace("_", " ")}
            </span>
            <p>{record.extracted_value || "—"}</p>
          </div>
        </div>

        {record.extraction_confidence && (
          <p className="text-dim verification-confidence">Extraction confidence: {record.extraction_confidence}</p>
        )}
      </div>

      {record.hr_decision ? (
        <div className="verification-decided">
          <Badge variant={record.hr_decision === "verified" ? "up" : "down"}>{record.hr_decision}</Badge>
          {record.hr_notes && <p className="text-soft verification-notes">"{record.hr_notes}"</p>}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="verification-decision-form">
          <Input as="select" label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="verified">Verify</option>
            <option value="rejected">Reject</option>
          </Input>
          <Input
            as="textarea"
            label="Notes (optional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {decideVerification.isError && (
            <p className="upload-error">{decideVerification.error.detail || decideVerification.error.message}</p>
          )}
          <Button type="submit" variant="glass" disabled={decideVerification.isPending}>
            {decideVerification.isPending ? "Saving…" : "Save decision"}
          </Button>
        </form>
      )}
    </GlassCard>
  );
}
