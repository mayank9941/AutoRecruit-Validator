import { useState, useEffect } from 'react';
import {
  Upload,
  FileText,
  Plus,
  Save,
  X,
  ChevronDown,
  GripVertical,
  Trash2,
  Star,
  AlertCircle,
} from 'lucide-react';
import { getJobProfiles } from '../services/api';
import { educationOptions, conditionOptions } from '../data/mockData';

function SkillTagInput({ skills, onChange }) {
  const [input, setInput] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);

  const addSkill = () => {
    const trimmed = input.trim();
    if (trimmed && !skills.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...skills, { name: trimmed, mandatory: isMandatory }]);
      setInput('');
    }
  };

  const removeSkill = (index) => {
    onChange(skills.filter((_, i) => i !== index));
  };

  const toggleType = (index) => {
    const updated = [...skills];
    updated[index].mandatory = !updated[index].mandatory;
    onChange(updated);
  };

  return (
    <div>
      <div className="tag-input-container">
        {skills.map((skill, i) => (
          <span
            key={i}
            className={`tag ${skill.mandatory ? 'mandatory' : 'preferred'}`}
            onClick={() => toggleType(i)}
            title={`Click to toggle ${skill.mandatory ? 'preferred' : 'mandatory'}`}
          >
            {skill.mandatory && <Star size={10} />}
            {skill.name}
            <button
              className="remove-btn"
              onClick={(e) => {
                e.stopPropagation();
                removeSkill(i);
              }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSkill();
            }
          }}
          placeholder="Type skill and press Enter..."
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)',
          marginTop: 'var(--space-sm)',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="radio"
            name="skillType"
            checked={isMandatory}
            onChange={() => setIsMandatory(true)}
          />
          Mandatory
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="radio"
            name="skillType"
            checked={!isMandatory}
            onChange={() => setIsMandatory(false)}
          />
          Preferred
        </label>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            marginLeft: 'auto',
          }}
        >
          Click a tag to toggle type
        </span>
      </div>
    </div>
  );
}

function CustomRuleBuilder({ rules, onChange }) {
  const addRule = () => {
    onChange([...rules, { fieldName: '', condition: 'equals', value: '' }]);
  };

  const updateRule = (index, field, val) => {
    const updated = [...rules];
    updated[index][field] = val;
    onChange(updated);
  };

  const removeRule = (index) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div>
      {rules.map((rule, i) => (
        <div className="rule-row" key={i}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '11px' }}>
              Field Name
            </label>
            <input
              className="form-input"
              value={rule.fieldName}
              onChange={(e) => updateRule(i, 'fieldName', e.target.value)}
              placeholder="e.g. Notice Period"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '11px' }}>
              Condition
            </label>
            <select
              className="form-select"
              value={rule.condition}
              onChange={(e) => updateRule(i, 'condition', e.target.value)}
            >
              {conditionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '11px' }}>
              Value
            </label>
            <input
              className="form-input"
              value={rule.value}
              onChange={(e) => updateRule(i, 'value', e.target.value)}
              placeholder="e.g. 60 days"
            />
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => removeRule(i)}
            style={{ marginTop: '18px' }}
            title="Remove rule"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={addRule} style={{ marginTop: 'var(--space-sm)' }}>
        <Plus size={14} />
        Add Custom Rule
      </button>
    </div>
  );
}

export default function JobProfile() {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [jdFile, setJdFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [saved, setSaved] = useState(false);

  // Criteria form state
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [skills, setSkills] = useState([]);
  const [eduDegree, setEduDegree] = useState('');
  const [eduField, setEduField] = useState('');
  const [eduMandatory, setEduMandatory] = useState(true);
  const [location, setLocation] = useState('');
  const [customRules, setCustomRules] = useState([]);

  useEffect(() => {
    async function load() {
      const data = await getJobProfiles();
      setProfiles(data);
      setLoading(false);
    }
    load();
  }, []);

  // Load profile data when selection changes
  useEffect(() => {
    if (selectedId && selectedId !== 'new') {
      const profile = profiles.find((p) => p.id === selectedId);
      if (profile) {
        setTitle(profile.title);
        setDepartment(profile.department);
        const cs = profile.criteriaSet;
        setMinExp(String(cs.minExperienceYears));
        setMaxExp(String(cs.maxExperienceYears));
        setSkills([...cs.requiredSkills]);
        if (cs.educationRequirements?.length) {
          setEduDegree(cs.educationRequirements[0].degree);
          setEduField(cs.educationRequirements[0].field);
          setEduMandatory(cs.educationRequirements[0].mandatory);
        }
        setLocation(cs.locationRequirements || '');
        setCustomRules(cs.customFields ? [...cs.customFields] : []);
      }
    } else if (selectedId === 'new') {
      resetForm();
    }
  }, [selectedId, profiles]);

  function resetForm() {
    setTitle('');
    setDepartment('');
    setMinExp('');
    setMaxExp('');
    setSkills([]);
    setEduDegree('');
    setEduField('');
    setEduMandatory(true);
    setLocation('');
    setCustomRules([]);
    setJdFile(null);
  }

  function handleNewProfile() {
    resetForm();
    setSelectedId('new');
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const mandatorySkillCount = skills.filter((s) => s.mandatory).length;
  const hasMandatoryCriteria = mandatorySkillCount > 0 || eduMandatory || (minExp && maxExp);

  return (
    <div className="animate-slide-up">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Job Profiles</h1>
          <p>Define screening criteria for job openings</p>
        </div>
        <div className="page-header-actions">
          <select
            className="form-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ width: '280px' }}
          >
            <option value="">Select a profile...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.status})
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleNewProfile}>
            <Plus size={16} />
            New Profile
          </button>
        </div>
      </div>

      {!selectedId ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={36} />
          </div>
          <h3>Select or Create a Job Profile</h3>
          <p>
            Choose an existing profile from the dropdown above, or use New
            Profile to define screening criteria.
          </p>
        </div>
      ) : (
        <div className="two-col-layout">
          {/* Left — JD Upload */}
          <div>
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <div className="card-header">
                <h3 className="card-title">Job Description</h3>
              </div>
              <div
                className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files.length) {
                    setJdFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => document.getElementById('jd-upload')?.click()}
              >
                <input
                  id="jd-upload"
                  type="file"
                  accept=".pdf,.docx,.doc"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files.length) setJdFile(e.target.files[0]);
                  }}
                />
                <div className="upload-zone-icon">
                  <Upload size={24} />
                </div>
                <p className="upload-zone-text">
                  <strong>Click to upload</strong> or drag and drop
                </p>
                <p className="upload-zone-hint">PDF or DOCX (max 10 MB)</p>
                {jdFile && (
                  <div className="upload-zone-file">
                    <div className="file-icon">
                      <FileText size={18} />
                    </div>
                    <div className="file-info">
                      <div className="file-name">{jdFile.name}</div>
                      <div className="file-size">
                        {(jdFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setJdFile(null);
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="card-glass" style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--status-review)' }} />
                <span>
                  Uploading a new JD for an existing profile will not overwrite
                  existing criteria. You will review and confirm changes.
                </span>
              </div>
            </div>
          </div>

          {/* Right — Criteria Editor */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Criteria Editor</h3>
              {selectedId !== 'new' && (
                <span className="badge badge-pending badge-dot">
                  v{profiles.find((p) => p.id === selectedId)?.criteriaSet?.version || 1}
                </span>
              )}
            </div>

            {/* Job Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Job Title <span className="required">*</span>
                </label>
                <input
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Department</label>
                <input
                  className="form-input"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Engineering"
                />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: 'var(--space-lg) 0' }} />

            {/* Experience Range */}
            <div className="form-group">
              <label className="form-label">
                Experience Range (years) <span className="required">*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={minExp}
                  onChange={(e) => setMinExp(e.target.value)}
                  placeholder="Min"
                  style={{ width: '120px' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={maxExp}
                  onChange={(e) => setMaxExp(e.target.value)}
                  placeholder="Max"
                  style={{ width: '120px' }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>years</span>
              </div>
            </div>

            {/* Skills */}
            <div className="form-group">
              <label className="form-label">
                Required Skills <span className="required">*</span>
              </label>
              <SkillTagInput skills={skills} onChange={setSkills} />
            </div>

            {/* Education */}
            <div className="form-group">
              <label className="form-label">Education Requirements</label>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 'var(--space-md)', alignItems: 'end' }}>
                <div>
                  <select
                    className="form-select"
                    value={eduDegree}
                    onChange={(e) => setEduDegree(e.target.value)}
                  >
                    <option value="">Degree level...</option>
                    {educationOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    className="form-input"
                    value={eduField}
                    onChange={(e) => setEduField(e.target.value)}
                    placeholder="Field of study (e.g. Computer Science)"
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={eduMandatory}
                    onChange={(e) => setEduMandatory(e.target.checked)}
                  />
                  Mandatory
                </label>
              </div>
            </div>

            {/* Location */}
            <div className="form-group">
              <label className="form-label">Location</label>
              <input
                className="form-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Delhi NCR / Remote"
              />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: 'var(--space-lg) 0' }} />

            {/* Custom Rules */}
            <div className="form-group">
              <label className="form-label">Custom Screening Rules</label>
              <CustomRuleBuilder rules={customRules} onChange={setCustomRules} />
            </div>

            {/* Save */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-xl)' }}>
              {!hasMandatoryCriteria && (
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--status-review)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={12} />
                  At least one mandatory criterion is required
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-md)' }}>
                <button className="btn btn-secondary" onClick={resetForm}>
                  Reset
                </button>
                <button
                  className={`btn ${saved ? 'btn-success' : 'btn-primary'}`}
                  onClick={handleSave}
                  disabled={!hasMandatoryCriteria}
                  style={{ minWidth: '140px' }}
                >
                  <Save size={16} />
                  {saved ? 'Saved!' : 'Save Criteria'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
