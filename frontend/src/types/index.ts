/**
 * Types mirroring the FastAPI backend's Pydantic schemas 1:1
 * (see backend/app/schemas/*.py). Kept close to the wire shape rather
 * than IHMCL's original mock shape, since this app now talks to the
 * real screening engine instead of client-side mock data.
 */

export interface HRUser {
  id: string;
  email: string;
}

// ---- Job Profiles / Criteria ----

export interface Criterion {
  id: string;
  type: 'age' | 'education' | 'experience' | 'skill' | 'other' | string;
  description: string;
  is_essential: boolean;
  display_order: number;
}

export interface AgeRelaxationRule {
  id: string;
  raw_category: string;
  normalized_category: string;
  relaxation_text: string;
}

export interface JobProfile {
  id: string;
  title: string;
  method_of_recruitment?: string | null;
  pay_scale?: string | null;
  base_age_min?: number | null;
  base_age_max?: number | null;
  criteria: Criterion[];
  age_relaxation_rules: AgeRelaxationRule[];
}

export interface JDUploadResponse {
  jd_upload_id: string;
  filename: string;
  parse_confidence: string;
  ambiguity_notes: string;
  post_count: number;
  validation_warnings: string[];
  is_duplicate: boolean;
  duplicate_message?: string | null;
  job_profiles: JobProfile[];
}

export interface CriterionCreate {
  type: string;
  description: string;
  is_essential?: boolean;
  display_order?: number | null;
}

export type CriterionUpdate = Partial<CriterionCreate>;

// ---- Candidates ----

export interface CandidateDocument {
  id: string;
  document_type: string;
  original_filename: string;
}

export type CandidateStatus = 'eligible' | 'not_eligible' | 'needs_review' | 'not_evaluated';

export interface Candidate {
  id: string;
  external_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  dob?: string | null;
  gender?: string | null;
  raw_category?: string | null;
  normalized_category?: string | null;
  ingestion_status: string;
  computed_status?: CandidateStatus | null;
  status: CandidateStatus;
  status_overridden: boolean;
  documents: CandidateDocument[];
}

export interface CandidateUploadSummary {
  job_profile_id: string;
  total_candidates_found: number;
  documents_complete: number;
  documents_incomplete: number;
  no_documents_found: number;
  excel_row_not_found: number;
  corrupt_zip: number;
  candidates: Candidate[];
}

// ---- Screening / Review ----

export interface CriterionEvaluation {
  id: string;
  criterion_id: string;
  result: 'pass' | 'fail' | 'needs_review' | string;
  citation_document?: string | null;
  citation_page?: number | null;
  reasoning?: string | null;
}

export interface CandidateEvaluationResult {
  candidate_id: string;
  ingestion_status: string;
  status: CandidateStatus;
  skipped: boolean;
  skip_reason?: string | null;
  evaluations: CriterionEvaluation[];
}

export interface ScreeningRun {
  id: string;
  job_profile_id: string;
  total_candidates: number;
  processed_count: number;
  failed_count: number;
  status: 'running' | 'completed' | 'failed' | string;
  started_at: string;
  completed_at?: string | null;
}

export interface CriterionEvaluationDetail {
  criterion_id: string;
  criterion_type: string;
  criterion_description: string;
  is_essential: boolean;
  result: string;
  citation_document?: string | null;
  citation_page?: number | null;
  reasoning?: string | null;
}

export interface CandidateReviewDetail {
  candidate_id: string;
  name?: string | null;
  email?: string | null;
  ingestion_status: string;
  computed_status?: CandidateStatus | null;
  status: CandidateStatus;
  status_overridden: boolean;
  override_reason?: string | null;
  overridden_by?: string | null;
  overridden_at?: string | null;
  evaluations: CriterionEvaluationDetail[];
}

export interface OverrideRequest {
  new_status: 'eligible' | 'not_eligible' | 'needs_review';
  reason?: string;
}

// ---- Results ----

export interface ResultsSummary {
  total: number;
  eligible: number;
  not_eligible: number;
  needs_review: number;
  not_evaluated: number;
}

export interface ResultsResponse {
  summary: ResultsSummary;
  candidates: Candidate[];
}

// ---- Dashboard ----

export interface RecentJDUpload {
  id: string;
  filename: string;
  uploaded_at: string;
  post_count: number;
}

export interface RecentScreeningRun {
  id: string;
  job_profile_id: string;
  job_profile_title: string;
  status: string;
  total_candidates: number;
  processed_count: number;
  failed_count: number;
  started_at: string;
  completed_at?: string | null;
}

export interface DashboardSummary {
  total_job_profiles: number;
  total_candidates: number;
  candidates_by_status: Record<string, number>;
  recent_jd_uploads: RecentJDUpload[];
  recent_screening_runs: RecentScreeningRun[];
}

// ---- Document Verification ----

export interface DocumentVerification {
  id: string;
  field_name: string;
  source_document_type: string;
  form_value?: string | null;
  extracted_value?: string | null;
  extraction_confidence?: string | null;
  match_status: 'matched' | 'mismatch' | 'low_confidence' | 'extraction_failed' | string;
  hr_decision?: 'verified' | 'rejected' | null;
  hr_notes?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
}

export interface CandidateVerificationSummary {
  candidate_id: string;
  skipped: boolean;
  skip_reason?: string | null;
  verifications: DocumentVerification[];
}

export interface BatchVerificationResult {
  job_profile_id: string;
  total_eligible: number;
  verified_count: number;
  skipped_count: number;
  failed_count: number;
  status: string;
  candidate_results: CandidateVerificationSummary[];
}
