import { useState, useEffect } from 'react';
import {
  FileArchive,
  FileText,
  Play,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Eye,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getJobProfiles, getCandidates, processBulkUpload } from '../services/api';

function CriteriaBreakdown({ result }) {
  const entries = Object.entries(result);
  return (
    <tr>
      <td colSpan="6" style={{ padding: 0 }}>
        <div className="criteria-breakdown animate-slide-up">
          <div className="criteria-breakdown-grid">
            {entries.map(([key, val]) => {
              const status = val.pass === true ? 'pass' : val.pass === false ? 'fail' : 'review';
              const Icon = status === 'pass' ? CheckCircle2 : status === 'fail' ? XCircle : AlertTriangle;
              return (
                <div className={`criteria-item ${status}`} key={key}>
                  <Icon className="icon" size={16} />
                  <span className="label" style={{ textTransform: 'capitalize' }}>{key}:</span>
                  <span className="value">{val.detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function UploadDropzone({
  id,
  accept,
  icon: Icon,
  title,
  description,
  hint,
  file,
  onFile,
  dragOver,
  onDragStateChange,
}) {
  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragStateChange(true);
      }}
      onDragLeave={() => onDragStateChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragStateChange(false);
        if (e.dataTransfer.files.length) {
          onFile(e.dataTransfer.files[0]);
        }
      }}
      onClick={() => document.getElementById(id)?.click()}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files.length) onFile(e.target.files[0]);
        }}
      />
      <div className="upload-zone-icon">
        <Icon size={24} />
      </div>
      <p className="upload-zone-text">
        <strong>{title}</strong> {description}
      </p>
      <p className="upload-zone-hint">{hint}</p>
      {file && (
        <div className="upload-zone-file">
          <div className="file-icon">
            <Icon size={18} />
          </div>
          <div className="file-info">
            <div className="file-name">{file.name}</div>
            <div className="file-size">{formatFileSize(file.size)}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              const input = document.getElementById(id);
              if (input) input.value = '';
              onFile(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function BulkScreening() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [zipFile, setZipFile] = useState(null);
  const [excelFile, setExcelFile] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processed, setProcessed] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [filter, setFilter] = useState('All');
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    async function load() {
      const data = await getJobProfiles();
      setProfiles(data.filter((p) => p.status === 'active'));
    }
    load();
  }, []);

  // Load candidates when profile changes or after processing
  useEffect(() => {
    async function loadCandidates() {
      if (selectedProfileId && processed) {
        const data = await getCandidates(selectedProfileId, filter);
        setCandidates(data);
      }
    }
    loadCandidates();
  }, [selectedProfileId, filter, processed]);

  async function handleProcess() {
    if (!selectedProfileId || !zipFile || !excelFile) return;
    setProcessing(true);
    setProgress({ current: 0, total: 142 });

    await processBulkUpload(selectedProfileId, zipFile, excelFile, (current, total) => {
      setProgress({ current, total });
    });

    setProcessing(false);
    setProcessed(true);
  }

  const eligibleCount = candidates.filter((c) => c.screeningStatus === 'Eligible').length;
  const reviewCount = candidates.filter((c) => c.screeningStatus === 'Needs Manual Review').length;
  const filteredCandidates = filter === 'All' ? candidates : candidates.filter((c) => c.screeningStatus === filter);

  return (
    <div className="animate-slide-up">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Bulk Screening</h1>
          <p>Upload candidate data and run automated screening</p>
        </div>
        <div className="page-header-actions">
          <select
            className="form-select"
            value={selectedProfileId}
            onChange={(e) => {
              setSelectedProfileId(e.target.value);
              setProcessed(false);
              setCandidates([]);
              setZipFile(null);
              setExcelFile(null);
            }}
            style={{ width: '280px' }}
          >
            <option value="">Select Job Profile...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedProfileId ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users size={36} />
          </div>
          <h3>Select a Job Profile</h3>
          <p>Choose an active job profile to begin screening candidates.</p>
        </div>
      ) : !processed ? (
        /* Upload & Process View */
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Upload Candidate Data</h3>
            </div>

            <div className="upload-stack">
              <UploadDropzone
                id="zip-upload"
                accept=".zip,application/zip,application/x-zip-compressed"
                icon={FileArchive}
                title="Upload ZIP file"
                description="containing resume PDFs"
                hint="ZIP should contain the individual candidate resume PDFs."
                file={zipFile}
                onFile={setZipFile}
                dragOver={dragOver === 'zip'}
                onDragStateChange={(active) => setDragOver(active ? 'zip' : null)}
              />

              <UploadDropzone
                id="excel-upload"
                accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                icon={FileText}
                title="Upload Excel file"
                description="containing candidate master data"
                hint="Excel or CSV master sheet with candidate details."
                file={excelFile}
                onFile={setExcelFile}
                dragOver={dragOver === 'excel'}
                onDragStateChange={(active) => setDragOver(active ? 'excel' : null)}
              />
            </div>

            {/* Processing Progress */}
            {processing && (
              <div style={{ marginTop: 'var(--space-xl)' }}>
                <div className="progress-bar-container">
                  <div className="progress-bar-header">
                    <span className="progress-bar-label">Processing candidates...</span>
                    <span className="progress-bar-value">
                      {progress.current} of {progress.total}
                    </span>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Process Button */}
            {!processing && (
              <div style={{ marginTop: 'var(--space-xl)', textAlign: 'right' }}>
                <button
                  className="btn btn-primary btn-lg"
                  disabled={!zipFile || !excelFile}
                  onClick={handleProcess}
                >
                  <Play size={18} />
                  Start Screening
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Results Table */
        <div>
          {/* Summary Cards */}
          <div className="stats-grid stagger-children" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="stat-card">
              <div className="stat-icon rose"><Users size={24} /></div>
              <div className="stat-content">
                <div className="stat-label">Total Processed</div>
                <div className="stat-value">{candidates.length}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><CheckCircle2 size={24} /></div>
              <div className="stat-content">
                <div className="stat-label">Eligible</div>
                <div className="stat-value">{eligibleCount}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber"><AlertTriangle size={24} /></div>
              <div className="stat-content">
                <div className="stat-label">Needs Review</div>
                <div className="stat-value">{reviewCount}</div>
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className="data-table-container">
            <div className="data-table-header">
              <h3 className="card-title">Screening Results</h3>
              <div className="data-table-filters">
                {['All', 'Eligible', 'Needs Manual Review'].map((f) => (
                  <button
                    key={f}
                    className={`filter-btn ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                    <span className="count">
                      ({f === 'All' ? candidates.length : f === 'Eligible' ? eligibleCount : reviewCount})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Candidate</th>
                  <th>Experience</th>
                  <th>Education</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => (
                  <>
                    <tr
                      key={c.id}
                      className={`expandable ${expandedRow === c.id ? 'expanded' : ''}`}
                      onClick={() => setExpandedRow(expandedRow === c.id ? null : c.id)}
                    >
                      <td>
                        {expandedRow === c.id ? (
                          <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                        ) : (
                          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                        )}
                      </td>
                      <td>
                        <div className="candidate-name">{c.name}</div>
                        <div className="candidate-email">{c.email}</div>
                      </td>
                      <td>{c.experience} years</td>
                      <td>{c.education}</td>
                      <td>
                        <span className={`badge badge-dot ${c.screeningStatus === 'Eligible' ? 'badge-eligible' : 'badge-review'}`}>
                          {c.screeningStatus}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedRow(expandedRow === c.id ? null : c.id);
                          }}
                        >
                          <Eye size={14} />
                          Details
                        </button>
                      </td>
                    </tr>
                    {expandedRow === c.id && c.screeningResult && (
                      <CriteriaBreakdown key={`${c.id}-breakdown`} result={c.screeningResult} />
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action bar */}
          {reviewCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'var(--space-xl)',
                padding: 'var(--space-md) var(--space-lg)',
                background: 'var(--status-review-bg)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--status-review)' }}>
                <AlertTriangle size={18} />
                <span style={{ fontWeight: 500 }}>{reviewCount} candidates need manual review</span>
              </div>
              <Link to="/manual-review" className="btn btn-primary btn-sm">
                Go to Manual Review
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
