import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import GlassCard from "../../components/GlassCard/GlassCard";
import Button from "../../components/Button/Button";
import Input from "../../components/Input/Input";
import Badge from "../../components/Badge/Badge";
import { useCandidateReview, useOverrideStatus } from "../../hooks/useReview";
import { formatDateTime } from "../../lib/format";
import "./Review.css";

const RESULT_VARIANT = {
  pass: "up",
  fail: "down",
  needs_review: "pending",
};

const OVERRIDE_STATUS_OPTIONS = [
  { value: "eligible", label: "Eligible" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "needs_review", label: "Needs Review" },
];

export default function Review() {
  const { profileId, candidateId } = useParams();
  const { data, isLoading, isError, error } = useCandidateReview(profileId, candidateId);

  if (isLoading) return <p className="text-soft">Loading review…</p>;
  if (isError) return <p className="upload-error">Couldn't load this candidate: {error.detail || error.message}</p>;

  return (
    <div className="review-page">
      <Link to={`/profiles/${profileId}/candidates`} className="back-link">
        ← Candidates
      </Link>

      <header className="review-header">
        <div className="review-header-top">
          <h1>{data.name || "Unnamed candidate"}</h1>
          <Badge status={data.status} />
          <Link to={`/profiles/${profileId}/candidates/${candidateId}/verification`} className="review-verify-link">
            <Button variant="glass">Document Verification →</Button>
          </Link>
        </div>
        <p className="text-soft">{data.email}</p>

        {data.status_overridden && (
          <div className="override-notice">
            <span className="text-dim">
              HR overrode this status{data.overridden_at ? ` on ${formatDateTime(data.overridden_at)}` : ""}
              {data.computed_status && ` (originally computed as `}
              {data.computed_status && <Badge status={data.computed_status} />}
              {data.computed_status && `)`}
            </span>
            {data.override_reason && <p className="override-reason">"{data.override_reason}"</p>}
          </div>
        )}
      </header>

      <section>
        <h2 className="section-title">Criterion-by-criterion breakdown</h2>
        <div className="review-evaluations">
          {data.evaluations.map((ev) => (
            <GlassCard key={ev.criterion_id} className="review-evaluation-row">
              <div className="review-evaluation-main">
                <div className="criterion-tags">
                  <span className="criterion-type">{ev.criterion_type}</span>
                  <span className={`criterion-essential ${ev.is_essential ? "essential" : "desirable"}`}>
                    {ev.is_essential ? "Essential" : "Desirable"}
                  </span>
                </div>
                <p className="criterion-description">{ev.criterion_description}</p>
                {ev.reasoning && <p className="review-reasoning text-soft">{ev.reasoning}</p>}
                {ev.citation_document && (
                  <p className="review-citation text-dim">
                    Source: {ev.citation_document}
                    {ev.citation_page ? `, page ${ev.citation_page}` : ""}
                  </p>
                )}
              </div>
              <Badge variant={RESULT_VARIANT[ev.result] || "neutral"}>
                {ev.result.replace("_", " ")}
              </Badge>
            </GlassCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Override status</h2>
        <OverrideForm profileId={profileId} candidateId={candidateId} currentStatus={data.status} />
      </section>
    </div>
  );
}

function OverrideForm({ profileId, candidateId, currentStatus }) {
  const [newStatus, setNewStatus] = useState(currentStatus === "not_evaluated" ? "eligible" : currentStatus);
  const [reason, setReason] = useState("");
  const overrideStatus = useOverrideStatus(profileId, candidateId);

  function handleSubmit(e) {
    e.preventDefault();
    overrideStatus.mutate(
      { new_status: newStatus, reason: reason || null },
      { onSuccess: () => setReason("") }
    );
  }

  return (
    <GlassCard as="form" onSubmit={handleSubmit} className="override-form">
      <div className="override-form-fields">
        <Input as="select" label="New status" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
          {OVERRIDE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Input>
      </div>
      <Input
        as="textarea"
        label="Reason (optional)"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why are you overriding the automated result?"
      />
      {overrideStatus.isError && (
        <p className="upload-error">{overrideStatus.error.detail || overrideStatus.error.message}</p>
      )}
      {overrideStatus.isSuccess && <p className="override-success">Status updated.</p>}
      <Button type="submit" variant="primary" disabled={overrideStatus.isPending}>
        {overrideStatus.isPending ? "Saving…" : "Save override"}
      </Button>
    </GlassCard>
  );
}
