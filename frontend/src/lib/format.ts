export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  eligible: 'Eligible',
  not_eligible: 'Not Eligible',
  needs_review: 'Needs Review',
  not_evaluated: 'Not Evaluated',
  documents_complete: 'Documents Complete',
  documents_incomplete: 'Documents Incomplete',
  no_documents_found: 'No Documents Found',
  excel_row_not_found: 'Row Not Found',
  corrupt_zip: 'Corrupt ZIP',
  pass: 'Pass',
  fail: 'Fail',
  needs_review_criterion: 'Needs Review',
  matched: 'Matched',
  mismatch: 'Mismatch',
  low_confidence: 'Low Confidence',
  extraction_failed: 'Extraction Failed',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export function statusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  return STATUS_LABEL[status] || status.replace(/_/g, ' ');
}

/** Tailwind class fragments for the four candidate-status buckets + criterion pass/fail. */
export function statusTone(status?: string | null): string {
  switch (status) {
    case 'eligible':
    case 'pass':
    case 'matched':
    case 'verified':
    case 'completed':
      return 'bg-success/15 text-success border-success/20';
    case 'not_eligible':
    case 'fail':
    case 'mismatch':
    case 'rejected':
    case 'failed':
      return 'bg-danger/15 text-danger border-danger/20';
    case 'needs_review':
    case 'low_confidence':
    case 'documents_incomplete':
    case 'running':
      return 'bg-warning/15 text-warning border-warning/20';
    default:
      return 'bg-muted/15 text-muted border-border';
  }
}
