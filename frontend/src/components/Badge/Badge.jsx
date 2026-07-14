import "./Badge.css";

// Maps our backend's candidate status strings to a display label + a
// visual variant (dot color). Centralized here so every screen that shows
// a candidate status (Results, Review, Candidates list) looks identical.
const STATUS_MAP = {
  eligible: { label: "Eligible", variant: "up" },
  not_eligible: { label: "Not Eligible", variant: "down" },
  needs_review: { label: "Needs Review", variant: "pending" },
  not_evaluated: { label: "Not Evaluated", variant: "neutral" },
};

/**
 * Generic badge: <Badge variant="up">Active</Badge>
 * Candidate status shorthand: <Badge status="eligible" />
 */
export default function Badge({ variant, status, children }) {
  if (status) {
    const mapped = STATUS_MAP[status] || { label: status, variant: "neutral" };
    return (
      <span className={`badge badge-${mapped.variant}`}>
        <i />
        {mapped.label}
      </span>
    );
  }

  return (
    <span className={`badge badge-${variant || "neutral"}`}>
      <i />
      {children}
    </span>
  );
}
