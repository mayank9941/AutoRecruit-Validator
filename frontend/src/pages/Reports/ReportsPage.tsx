import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle2, XCircle, HelpCircle, Clock, Users, Loader2 } from 'lucide-react';
import { useResults } from '../../hooks/useResults';
import { useJobProfile } from '../../hooks/useJobProfile';
import { StatusBadge } from '../../components/StatusBadge';
import { BASE_URL } from '../../lib/api';

const FILTERS = [
  { value: undefined, label: 'All', icon: Users },
  { value: 'eligible', label: 'Eligible', icon: CheckCircle2 },
  { value: 'not_eligible', label: 'Not Eligible', icon: XCircle },
  { value: 'needs_review', label: 'Needs Review', icon: HelpCircle },
  { value: 'not_evaluated', label: 'Not Evaluated', icon: Clock },
] as const;

const SUMMARY_CONFIG = [
  { key: 'total', label: 'Total', color: 'text-foreground', bg: 'bg-accent', border: 'border-border', icon: Users },
  { key: 'eligible', label: 'Eligible', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', icon: CheckCircle2 },
  { key: 'not_eligible', label: 'Not Eligible', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/20', icon: XCircle },
  { key: 'needs_review', label: 'Needs Review', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', icon: HelpCircle },
  { key: 'not_evaluated', label: 'Not Evaluated', color: 'text-muted', bg: 'bg-muted/10', border: 'border-border', icon: Clock },
];

export const ReportsPage: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const { data: profile } = useJobProfile(profileId);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading } = useResults(profileId, status);

  const handleExport = async () => {
    setExporting(true);
    try {
      const url = `${BASE_URL}/jd/profiles/${profileId}/results/export${status ? `?status=${status}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename=(.+)/);
      a.download = match ? match[1] : 'results.xlsx';
      a.click();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to={`/recruitment/${profileId}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted hover:text-primary transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to job profile
          </Link>
          <h1 className="font-black text-2xl text-foreground tracking-tight">
            Results{profile ? <span className="font-medium text-muted"> — {profile.title}</span> : ''}
          </h1>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity shadow-md shadow-primary/10"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {SUMMARY_CONFIG.map(({ key, label, color, bg, border, icon: Icon }) => (
            <div key={key} className={`${bg} border ${border} rounded-2xl p-4 flex flex-col gap-2`}>
              <Icon className={`w-4 h-4 ${color}`} />
              <div>
                <p className={`text-2xl font-black ${color}`}>{(data.summary as any)[key]}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const isActive = status === f.value;
          return (
            <button
              key={f.label}
              onClick={() => setStatus(f.value)}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-xl border transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'border-border text-muted hover:text-foreground hover:border-primary/30 bg-card'
              }`}
            >
              <f.icon className="w-3.5 h-3.5" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Results table */}
      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        {isLoading && (
          <div className="p-8 flex items-center justify-center gap-2 text-muted text-xs font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading results…
          </div>
        )}
        {!isLoading && data?.candidates.length === 0 && (
          <div className="p-10 text-center flex flex-col items-center gap-2">
            <Users className="w-8 h-8 text-muted" />
            <p className="text-sm font-bold text-foreground">No candidates match this filter</p>
            <p className="text-xs text-muted font-medium">Try a different status filter above.</p>
          </div>
        )}
        {!isLoading && data && data.candidates.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent/60 border-b border-border">
                  <th className="text-left py-3 px-5 text-[10px] font-black uppercase tracking-widest text-muted">Candidate</th>
                  <th className="text-left py-3 px-5 text-[10px] font-black uppercase tracking-widest text-muted">Category</th>
                  <th className="text-left py-3 px-5 text-[10px] font-black uppercase tracking-widest text-muted">Status</th>
                  <th className="py-3 px-5" />
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-b border-border/60 hover:bg-accent/40 transition-colors ${i % 2 === 0 ? '' : 'bg-accent/20'}`}
                  >
                    <td className="py-3 px-5 font-bold text-foreground">{c.name || c.external_id}</td>
                    <td className="py-3 px-5 text-muted font-medium">{c.normalized_category || c.raw_category || '—'}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        {c.status_overridden && (
                          <span className="text-[9px] font-bold text-warning bg-warning/10 border border-warning/20 rounded-full px-2 py-0.5">overridden</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <Link
                        to={`/candidate/${profileId}/${c.id}`}
                        className="text-[11px] font-bold text-primary hover:underline"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
