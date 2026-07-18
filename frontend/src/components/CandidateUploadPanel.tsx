import React, { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, FolderArchive, Upload, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useUploadCandidates } from '../hooks/useCandidates';
import { ApiError } from '../context/AuthContext';

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
      <div className="border border-success/30 bg-success/5 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground truncate">{file.name}</p>
          <p className="text-[11px] text-muted font-medium">{formatBytes(file.size)} · {label}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
          disabled={disabled}
          className="p-1.5 rounded-lg hover:bg-danger/10 text-muted hover:text-danger shrink-0"
          title="Remove file"
        >
          <X className="w-4 h-4" />
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
      className={`border-2 border-dashed rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-colors ${
        isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-accent/20 hover:border-primary/40'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-foreground">{label}</p>
        <p className="text-[11px] text-muted font-medium">{hint}</p>
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
}

export const CandidateUploadPanel: React.FC<CandidateUploadPanelProps> = ({ profileId }) => {
  const uploadCandidates = useUploadCandidates(profileId);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{
    total: number;
    complete: number;
    incomplete: number;
    missing: number;
  } | null>(null);

  const bothSelected = !!excelFile && !!zipFile;

  const handleUpload = async () => {
    if (!excelFile || !zipFile) return;
    setUploadError(null);
    setUploadSummary(null);
    try {
      const result = await uploadCandidates.mutateAsync({ excelFile, masterZipFile: zipFile });
      setUploadSummary({
        total: result.total_candidates_found,
        complete: result.documents_complete,
        incomplete: result.documents_incomplete,
        missing: result.no_documents_found,
      });
      setExcelFile(null);
      setZipFile(null);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.detail : 'Something went wrong uploading candidates. Please try again.');
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Upload className="w-4.5 h-4.5 text-primary" />
        <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Upload Candidates</h2>
      </div>
      <p className="text-[11px] text-muted font-medium leading-relaxed">
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
        className="bg-primary text-primary-foreground font-bold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {uploadCandidates.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading and matching documents…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            {bothSelected ? 'Upload Candidates' : 'Add both files to continue'}
          </>
        )}
      </button>

      {uploadError && (
        <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-xl flex items-start gap-2 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {uploadSummary && (
        <div className="p-3 bg-success/10 border border-success/20 rounded-xl flex flex-col gap-2">
          <div className="flex items-center gap-2 text-success text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {uploadSummary.total} candidate{uploadSummary.total === 1 ? '' : 's'} uploaded
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] font-extrabold px-2.5 py-1 bg-success/15 text-success rounded-full">
              {uploadSummary.complete} ready to screen
            </span>
            {uploadSummary.incomplete > 0 && (
              <span className="text-[10px] font-extrabold px-2.5 py-1 bg-warning/15 text-warning rounded-full">
                {uploadSummary.incomplete} incomplete documents
              </span>
            )}
            {uploadSummary.missing > 0 && (
              <span className="text-[10px] font-extrabold px-2.5 py-1 bg-danger/15 text-danger rounded-full">
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
