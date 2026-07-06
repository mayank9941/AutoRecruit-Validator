import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  User,
  ArrowRight,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { getJobProfiles, getCandidates, updateCandidateStatus } from '../services/api';

export default function ManualReview() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [notes, setNotes] = useState('');
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
        const data = await getCandidates(selectedProfileId, 'Needs Manual Review');
        setCandidates(data);
        setSelectedCandidate(null);
      }
    }
    loadCandidates();
  }, [selectedProfileId]);

  async function handleAction(status) {
    if (!selectedCandidate) return;
    await updateCandidateStatus(selectedCandidate.id, status, notes);
    setActionTaken(status);

    setTimeout(() => {
      setCandidates((prev) => prev.filter((c) => c.id !== selectedCandidate.id));
      setSelectedCandidate(null);
      setNotes('');
      setActionTaken(null);
    }, 1500);
  }

  return (
    <div className="animate-slide-up">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Manual Review</h1>
          <p>Review flagged candidates and make eligibility decisions</p>
        </div>
        <div className="page-header-actions">
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
            <CheckCircle2 size={36} />
          </div>
          <h3>No Candidates Pending Review</h3>
          <p>All flagged candidates have been reviewed. Great work!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 'var(--space-xl)', alignItems: 'start' }}>
          {/* Left — Candidate List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Flagged Candidates</h3>
              <span className="badge badge-review badge-dot">{candidates.length}</span>
            </div>
            <div className="candidate-list">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className={`candidate-list-item ${selectedCandidate?.id === c.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedCandidate(c);
                    setNotes('');
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
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Right — Detail View */}
          {selectedCandidate ? (
            <div className="animate-slide-in-right">
              {/* Candidate Info */}
              <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                  <div className="sidebar-avatar" style={{ width: '56px', height: '56px', fontSize: 'var(--font-lg)' }}>
                    {selectedCandidate.name.split(' ').map((w) => w[0]).join('')}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 'var(--font-xl)', marginBottom: '4px' }}>
                      {selectedCandidate.name}
                    </h2>
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                      {selectedCandidate.email} • {selectedCandidate.phone}
                    </div>
                  </div>
                  <span className="badge badge-review badge-dot" style={{ marginLeft: 'auto' }}>
                    Needs Review
                  </span>
                </div>

                {/* Quick Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
                  <div style={{ padding: 'var(--space-md)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Experience</div>
                    <div style={{ fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text-heading)' }}>{selectedCandidate.experience} years</div>
                  </div>
                  <div style={{ padding: 'var(--space-md)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Education</div>
                    <div style={{ fontSize: 'var(--font-sm)', fontWeight: 500, color: 'var(--text-heading)' }}>{selectedCandidate.education}</div>
                  </div>
                  <div style={{ padding: 'var(--space-md)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Skills</div>
                    <div style={{ fontSize: 'var(--font-sm)', fontWeight: 500, color: 'var(--text-heading)' }}>{selectedCandidate.skills?.join(', ')}</div>
                  </div>
                </div>
              </div>

              {/* Screening Breakdown */}
              <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="card-header">
                  <h3 className="card-title">Screening Breakdown</h3>
                </div>
                <div className="criteria-breakdown-grid">
                  {Object.entries(selectedCandidate.screeningResult).map(([key, val]) => {
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

              {/* Review Notes & Actions */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Review Decision</h3>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <MessageSquare size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    Notes (recorded in audit log)
                  </label>
                  <textarea
                    className="form-textarea"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add review notes explaining your decision..."
                    rows={3}
                  />
                </div>

                {actionTaken ? (
                  <div
                    className="animate-slide-up"
                    style={{
                      textAlign: 'center',
                      padding: 'var(--space-lg)',
                      background: actionTaken === 'Eligible' ? 'var(--status-eligible-bg)' : 'var(--status-rejected-bg)',
                      borderRadius: 'var(--radius-md)',
                      color: actionTaken === 'Eligible' ? 'var(--status-eligible)' : 'var(--status-rejected)',
                    }}
                  >
                    {actionTaken === 'Eligible' ? (
                      <><CheckCircle2 size={24} style={{ marginBottom: '8px' }} /><br />Moved to Eligible</>
                    ) : (
                      <><XCircle size={24} style={{ marginBottom: '8px' }} /><br />Rejected</>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleAction('Rejected')}
                      style={{ flex: 1 }}
                    >
                      <XCircle size={16} />
                      Reject
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={() => handleAction('Eligible')}
                      style={{ flex: 1 }}
                    >
                      <CheckCircle2 size={16} />
                      Move to Eligible
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <User size={36} />
              </div>
              <h3>Select a Candidate</h3>
              <p>Click on a candidate from the list to review their details.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
