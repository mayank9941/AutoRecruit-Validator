import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileText, ArrowRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { useJobProfiles, useUploadJD } from '../../hooks/useJobProfiles';
import { ApiError } from '../../context/AuthContext';

export const JobProfilesPage: React.FC = () => {
  const { data: profiles, isLoading, isError } = useJobProfiles();
  const uploadJD = useUploadJD();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ post_count: number; is_duplicate: boolean; warnings: string[] } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setLastResult(null);
    try {
      const result = await uploadJD.mutateAsync(file);
      setLastResult({
        post_count: result.post_count,
        is_duplicate: result.is_duplicate,
        warnings: result.validation_warnings,
      });
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.detail : 'Upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-black text-2xl text-foreground tracking-tight">Job Profiles</h1>
          <p className="text-xs text-muted font-medium mt-1">
            Upload a JD PDF — Gemini extracts posts, criteria, and age relaxation rules automatically.
          </p>
        </div>

        <div>
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadJD.isPending}
            className="bg-primary text-primary-foreground font-bold text-xs px-5 py-3 rounded-2xl flex items-center gap-2 shadow-md shadow-primary/10 disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {uploadJD.isPending ? 'Parsing JD…' : 'Upload JD PDF'}
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-xl flex items-start gap-2 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {uploadError}
        </div>
      )}
      {lastResult && (
        <div className="p-3 bg-success/10 border border-success/20 text-success rounded-xl flex items-start gap-2 text-xs font-semibold">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {lastResult.is_duplicate
              ? 'This JD was already uploaded — showing the existing profile(s) instead of creating duplicates.'
              : `Created ${lastResult.post_count} job profile${lastResult.post_count === 1 ? '' : 's'} from this JD.`}
            {lastResult.warnings.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-warning font-medium">
                {lastResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm font-semibold text-muted">Loading job profiles…</p>}
      {isError && <p className="text-sm font-semibold text-danger">Failed to load job profiles.</p>}

      {profiles && profiles.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-3xl p-10 text-center flex flex-col items-center gap-3">
          <FileText className="w-8 h-8 text-muted" />
          <p className="text-sm font-bold text-foreground">No job profiles yet</p>
          <p className="text-xs text-muted font-medium max-w-sm">
            Upload a recruitment JD PDF above to auto-create your first job profile and its screening criteria.
          </p>
        </div>
      )}

      {profiles && profiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {profiles.map((p) => (
            <Link
              key={p.id}
              to={`/recruitment/${p.id}`}
              className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4 hover:border-primary/40 transition-colors"
            >
              <div>
                <h3 className="font-bold text-sm text-foreground">{p.title}</h3>
                {p.method_of_recruitment && (
                  <p className="text-[11px] text-muted font-medium mt-0.5">{p.method_of_recruitment}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {p.base_age_min != null && p.base_age_max != null && (
                  <span className="text-[10px] font-extrabold px-2.5 py-1 bg-accent text-accent-foreground rounded-full">
                    Age {p.base_age_min}–{p.base_age_max}
                  </span>
                )}
                <span className="text-[10px] font-extrabold px-2.5 py-1 bg-primary/10 text-primary rounded-full">
                  {p.criteria.length} criteria
                </span>
                {p.age_relaxation_rules.length > 0 && (
                  <span className="text-[10px] font-extrabold px-2.5 py-1 bg-accent text-accent-foreground rounded-full">
                    {p.age_relaxation_rules.length} relaxation rules
                  </span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-1 text-[11px] font-bold text-primary">
                Open profile <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobProfilesPage;
