import React, { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, FolderArchive, Upload, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useUploadCandidates } from '../hooks/useCandidates';
import { ApiError } from '../context/AuthContext';
import type { CandidateUploadSummary } from '../types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileSlotProps {
  label: string;
  hint: string;
  icon: React.ElementType;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * One drag-and-drop / click-to-browse slot for a single required file.
 * Shows a clear empty state, a file chip with size + remove button once
 * a file is chosen, and a "drop here" highlight while dragging over it.
 */
const FileSlot: React.FC<FileSlotProps> = ({ label, hint, icon: Icon, accept, file, onChange, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) onChange(dropped);
    },
    [disabled, onChange]
  );

  if (file) {
    return (
      <div className="border border-success/30 bg-success/5 rounded-lg p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-success/15 text-success flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
          <p className="text-sm text-muted font-normal">{formatBytes(file.size)} · {label}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
          disabled={disabled}
          className="text-sm font-semibold px-3 py-2 rounded-lg border border-border hover:bg-danger/10 text-foreground hover:text-danger flex items-center gap-1.5 shrink-0"
          title="Remove file"
        >
          <X className="w-4 h-4" />
          Remove
        </button>
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors ${
        isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-accent/20 hover:border-primary/40'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted font-normal">{hint}</p>
      </div>
      <Upload className="w-4 h-4 text-muted shrink-0" />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="hidden"
      />
    </label>
  );
};

interface CandidateUploadPanelProps {
  profileId?: string;
  /** Overrides the upload button label (e.g. "Upload & Start Screening"). */
  actionLabel?: string;
  /** Called the moment the upload begins — lets the wizard switch screens immediately. */
  onUploadStart?: () => void;
  /** Called after a successful upload — lets the wizard chain screening. */
  onUploaded?: (summary: CandidateUploadSummary) => void;
  /** Called when the upload fails — needed when the wizard has already navigated away. */
  onUploadError?: (message: string) => void;
}

export const CandidateUploadPanel: React.FC<CandidateUploadPanelProps> = ({
  profileId,
  actionLabel,
  onUploadStart,
  onUploaded,
  onUploadError,
}) => {
  const uploadCandidates = useUploadCandidates(profileId);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{
    total: number;
    replaced: number;
    complete: number;
    incomplete: number;
    missing: number;
  } | null>(null);

  const bothSelected = !!excelFile && !!zipFile;

  const handleUpload = async () => {
    if (!excelFile || !zipFile) return;
    setUploadError(null);
    setUploadSummary(null);
    onUploadStart?.();
    try {
      const result = await uploadCandidates.mutateAsync({ excelFile, masterZipFile: zipFile });
      setUploadSummary({
        total: result.total_candidates_found,
        replaced: result.replaced_candidates ?? 0,
        complete: result.documents_complete,
        incomplete: result.documents_incomplete,
        missing: result.no_documents_found,
      });
      setExcelFile(null);
      setZipFile(null);
      onUploaded?.(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : 'Something went wrong uploading candidates. Please try again.';
      setUploadError(message);
      onUploadError?.(message);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Upload className="w-4.5 h-4.5 text-primary" />
        <h2 className="font-semibold text-base text-foreground">Upload candidates</h2>
      </div>
      <p className="text-sm text-muted font-normal leading-relaxed">
        Two files are needed together: the candidate roster (Excel export) and a ZIP of everyone's
        documents. Candidates are matched between the two using the <code>Id.</code> column, so both
        must come from the same export batch.
      </p>

      <div className="flex flex-col gap-3">
        <FileSlot
          label="Candidate roster"
          hint="Excel export with an 'Id.' column · .xlsx, .xls or .csv"
          icon={FileSpreadsheet}
          accept=".xlsx,.xls,.csv,.txt"
          file={excelFile}
          onChange={setExcelFile}
          disabled={uploadCandidates.isPending}
        />
        <FileSlot
          label="Documents ZIP"
          hint="One nested ZIP per candidate, named by their ID · .zip"
          icon={FolderArchive}
          accept=".zip"
          file={zipFile}
          onChange={setZipFile}
          disabled={uploadCandidates.isPending}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!bothSelected || uploadCandidates.isPending}
        className="bg-primary text-primary-foreground font-semibold text-sm px-5 py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {uploadCandidates.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading and matching documents…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            {bothSelected ? (actionLabel ?? 'Upload candidates') : 'Add both files to continue'}
          </>
        )}
      </button>

      {uploadError && (
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg flex items-start gap-2 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {uploadSummary && (
        <div className="p-3 bg-success/10 border border-success/20 rounded-lg flex flex-col gap-2">
          <div className="flex items-center gap-2 text-success text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {uploadSummary.total} candidate{uploadSummary.total === 1 ? '' : 's'} uploaded
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium px-2.5 py-1 bg-success/15 text-success rounded-md">
              {uploadSummary.complete} ready to screen
            </span>
            {uploadSummary.replaced > 0 && (
              <span className="text-sm font-medium px-2.5 py-1 bg-primary/15 text-primary rounded-md">
                {uploadSummary.replaced} existing replaced (will need re-screening)
              </span>
            )}
            {uploadSummary.incomplete > 0 && (
              <span className="text-sm font-medium px-2.5 py-1 bg-warning/15 text-warning rounded-md">
                {uploadSummary.incomplete} incomplete documents
              </span>
            )}
            {uploadSummary.missing > 0 && (
              <span className="text-sm font-medium px-2.5 py-1 bg-danger/15 text-danger rounded-md">
                {uploadSummary.missing} missing documents
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateUploadPanel;
