import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  FileCheck,
  User,
  Eye,
} from 'lucide-react';
import { getJobProfiles, getVerificationCandidates, verifyCandidate } from '../services/api';

function FieldCompareRow({ label, formValue, docValue }) {
  const match = formValue === docValue;
  const Icon = match ? CheckCircle2 : XCircle;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '140px 1fr 40px 1fr',
      alignItems: 'center',
      padding: 'var(--space-md) var(--space-lg)',
      borderBottom: '1px solid var(--border-default)',
      gap: 'var(--space-md)',
    }}>
      <span style={{
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-heading)',
        padding: 'var(--space-sm) var(--space-md)',
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-sm)',
      }}>
        {formValue}
      </span>
      <div className={`match-indicator ${match ? 'match' : 'mismatch'}`}>
        <Icon size={16} />
      </div>
      <span style={{
        fontSize: 'var(--font-sm)',
        color: match ? 'var(--text-heading)' : 'var(--status-rejected)',
        fontWeight: match ? 400 : 600,
        padding: 'var(--space-sm) var(--space-md)',
        background: match ? 'var(--bg-primary)' : 'var(--status-rejected-bg)',
        borderRadius: 'var(--radius-sm)',
      }}>
        {docValue}
      </span>
    </div>
  );
}

export default function Verification() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [actionTaken, setActionTaken] = useState(null);

  useEffect(() => {
    async function load() {
      const data = await getJobProfiles();
      setProfiles(data.filter((p) => p.status === 'active'));
      if (data.length > 0) {
        const firstActive = data.find((p) => p.status === 'active');
        if (firstActive) setSelectedProfileId(firstActive.id);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadCandidates() {
      if (selectedProfileId) {
        const data = await getVerificationCandidates(selectedProfileId);
        setCandidates(data);
        setSelectedCandidate(null);
      }
    }
    loadCandidates();
  }, [selectedProfileId]);

  async function handleVerification(verified) {
    if (!selectedCandidate) return;
    await verifyCandidate(selectedCandidate.id, verified);
    setActionTaken(verified ? 'Verified' : 'Rejected');

    setTimeout(() => {
      setActionTaken(null);
      // Refresh candidate list
      const updated = candidates.map((c) =>
        c.id === selectedCandidate.id
          ? {
              ...c,
              verificationStatus: verified ? 'Verified' : 'Rejected',
              finalStatus: verified ? 'Interview Ready' : 'Not Eligible',
            }
          : c
      );
      setCandidates(updated);
      setSelectedCandidate(updated.find((c) => c.id === selectedCandidate.id));
    }, 1500);
  }

  const pendingCount = candidates.filter((c) => c.verificationStatus === 'Pending').length;
  const verifiedCount = candidates.filter((c) => c.verificationStatus === 'Verified').length;
  const rejectedCount = candidates.filter((c) => c.verificationStatus === 'Rejected').length;

  function getStatusBadge(status) {
    switch (status) {
      case 'Verified':
        return <span className="badge badge-verified badge-dot">Verified</span>;
      case 'Rejected':
        return <span className="badge badge-rejected badge-dot">Rejected</span>;
      default:
        return <span className="badge badge-pending badge-dot">Pending</span>;
    }
  }

  const hasFormData = selectedCandidate?.formData && selectedCandidate?.documentData;
  const formData = selectedCandidate?.formData;
  const docData = selectedCandidate?.documentData;

  // Check if all fields match
  const allFieldsMatch = formData && docData && Object.keys(formData).every(
    (key) => formData[key] === docData[key]
  );
  const mismatchedFields = formData && docData
    ? Object.keys(formData).filter((key) => formData[key] !== docData[key])
    : [];

  return (
    <div className="animate-slide-up">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Document Verification</h1>
          <p>Compare application data against uploaded documents</p>
        </div>
        <div className="page-header-actions">
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
            <span className="badge badge-pending badge-dot">{pendingCount} Pending</span>
            <span className="badge badge-verified badge-dot">{verifiedCount} Verified</span>
            <span className="badge badge-rejected badge-dot">{rejectedCount} Rejected</span>
          </div>
          <select
            className="form-select"
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            style={{ width: '280px' }}
          >
            <option value="">Select Job Profile...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ShieldCheck size={36} />
          </div>
          <h3>No Candidates for Verification</h3>
          <p>Eligible candidates from the screening step will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 'var(--space-xl)', alignItems: 'start' }}>
          {/* Left — Candidate List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Eligible Candidates</h3>
              <span className="badge badge-eligible badge-dot">{candidates.length}</span>
            </div>
            <div className="candidate-list">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className={`candidate-list-item ${selectedCandidate?.id === c.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedCandidate(c);
                    setActionTaken(null);
                  }}
                >
                  <div className="sidebar-avatar" style={{ width: '40px', height: '40px', fontSize: 'var(--font-sm)' }}>
                    {c.name.split(' ').map((w) => w[0]).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="candidate-name">{c.name}</div>
                    <div className="candidate-email">{c.experience} yrs • {c.education}</div>
                  </div>
                  {getStatusBadge(c.verificationStatus)}
                </div>
              ))}
            </div>
          </div>

          {/* Right — Compare View */}
          {selectedCandidate ? (
            <div className="animate-slide-in-right">
              {/* Candidate Header */}
              <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
                  <div className="sidebar-avatar" style={{ width: '56px', height: '56px', fontSize: 'var(--font-lg)' }}>
                    {selectedCandidate.name.split(' ').map((w) => w[0]).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 'var(--font-xl)', marginBottom: '4px' }}>
                      {selectedCandidate.name}
                    </h2>
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                      {selectedCandidate.email} • {selectedCandidate.phone}
                    </div>
                  </div>
                  {getStatusBadge(selectedCandidate.verificationStatus)}
                </div>
              </div>

              {/* Compare View */}
              {hasFormData ? (
                <div className="card" style={{ marginBottom: 'var(--space-lg)', padding: 0, overflow: 'hidden' }}>
                  {/* Compare Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr 40px 1fr',
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'rgba(237, 237, 237, 0.72)',
                    borderBottom: '1px solid var(--border-default)',
                    gap: 'var(--space-md)',
                  }}>
                    <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Field
                    </span>
                    <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--color-platinum)', textTransform: 'uppercase' }}>
                      Application Form
                    </span>
                    <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>
                      ✓/✗
                    </span>
                    <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--status-verified)', textTransform: 'uppercase' }}>
                      Document Data
                    </span>
                  </div>

                  {/* Field Comparisons */}
                  <FieldCompareRow label="Full Name" formValue={formData.name} docValue={docData.name} />
                  <FieldCompareRow label="Date of Birth" formValue={formData.dob} docValue={docData.dob} />
                  <FieldCompareRow label="Education" formValue={formData.education} docValue={docData.education} />
                  <FieldCompareRow label="Experience" formValue={formData.experience} docValue={docData.experience} />
                  <FieldCompareRow label="ID Number" formValue={formData.idNumber} docValue={docData.idNumber} />

                  {/* Summary */}
                  <div style={{
                    padding: 'var(--space-md) var(--space-lg)',
                    background: allFieldsMatch ? 'var(--status-eligible-bg)' : 'var(--status-rejected-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    color: allFieldsMatch ? 'var(--status-eligible)' : 'var(--status-rejected)',
                    fontWeight: 500,
                    fontSize: 'var(--font-sm)',
                  }}>
                    {allFieldsMatch ? (
                      <><CheckCircle2 size={16} /> All fields match — ready for verification</>
                    ) : (
                      <><AlertTriangle size={16} /> {mismatchedFields.length} field(s) have mismatches: {mismatchedFields.join(', ')}</>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ marginBottom: 'var(--space-lg)', textAlign: 'center', padding: 'var(--space-2xl)' }}>
                  <AlertTriangle size={32} style={{ color: 'var(--status-review)', marginBottom: 'var(--space-md)' }} />
                  <h3>Documents Not Available</h3>
                  <p style={{ color: 'var(--text-muted)' }}>
                    Document data has not been uploaded or extracted for this candidate.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              {selectedCandidate.verificationStatus === 'Pending' && hasFormData && (
                <div className="card">
                  {actionTaken ? (
                    <div
                      className="animate-slide-up"
                      style={{
                        textAlign: 'center',
                        padding: 'var(--space-lg)',
                        background: actionTaken === 'Verified' ? 'var(--status-verified-bg)' : 'var(--status-rejected-bg)',
                        borderRadius: 'var(--radius-md)',
                        color: actionTaken === 'Verified' ? 'var(--status-verified)' : 'var(--status-rejected)',
                      }}
                    >
                      {actionTaken === 'Verified' ? (
                        <><CheckCircle2 size={24} style={{ marginBottom: '8px' }} /><br />Verified — Moved to Interview Ready</>
                      ) : (
                        <><XCircle size={24} style={{ marginBottom: '8px' }} /><br />Rejected — Not Eligible</>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleVerification(false)}
                        style={{ flex: 1 }}
                      >
                        <XCircle size={16} />
                        Reject — Mismatch Found
                      </button>
                      <button
                        className="btn btn-success"
                        onClick={() => handleVerification(true)}
                        style={{ flex: 1 }}
                      >
                        <CheckCircle2 size={16} />
                        Verify — All Correct
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedCandidate.verificationStatus !== 'Pending' && (
                <div className="card" style={{
                  textAlign: 'center',
                  background: selectedCandidate.verificationStatus === 'Verified'
                    ? 'var(--status-verified-bg)' : 'var(--status-rejected-bg)',
                  color: selectedCandidate.verificationStatus === 'Verified'
                    ? 'var(--status-verified)' : 'var(--status-rejected)',
                  border: `1px solid ${selectedCandidate.verificationStatus === 'Verified'
                    ? 'var(--border-default)' : 'var(--border-default)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)' }}>
                    {selectedCandidate.verificationStatus === 'Verified'
                      ? <><CheckCircle2 size={20} /> <strong>Verified</strong> — {selectedCandidate.finalStatus}</>
                      : <><XCircle size={20} /> <strong>Rejected</strong> — {selectedCandidate.finalStatus}</>
                    }
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Eye size={36} />
              </div>
              <h3>Select a Candidate</h3>
              <p>Click on a candidate to compare their application data with document data.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
