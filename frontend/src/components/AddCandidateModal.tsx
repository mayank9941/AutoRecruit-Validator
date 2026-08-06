import React, { useState } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Candidate } from '../types';

interface Props {
  profileId?: string;
  onClose: () => void;
}

/**
 * Manually add ONE candidate to a profile (walk-ins / late applications),
 * with their declared details and document PDFs. Documents are optional,
 * but without them screening will skip the candidate as "no documents".
 */
export const AddCandidateModal: React.FC<Props> = ({ profileId, onClose }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    external_id: '', name: '', email: '', phone: '',
    dob: '', gender: '', category: '', declared_info: '',
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const addCandidate = useMutation<Candidate, Error, void>({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v.trim()) fd.append(k, v.trim());
      });
      if (files) Array.from(files).forEach((f) => fd.append('documents', f));
      return api.post(`/jd/profiles/${profileId}/candidates/single`, fd, { isFormData: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onClose();
    },
    onError: (e: any) => setError(e?.detail || e?.message || 'Failed to add the candidate.'),
  });

  const inputCls =
    'w-full bg-card border border-border text-foreground text-sm font-normal rounded-lg px-3 py-2.5 placeholder:text-muted';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> Add candidate
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          className="px-6 py-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            addCandidate.mutate();
          }}
        >
          <input required value={form.external_id} onChange={set('external_id')} placeholder="Candidate ID * (e.g. IHM/JA/1900/10001)" className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={set('name')} placeholder="Full name" className={inputCls} />
            <input value={form.email} onChange={set('email')} placeholder="Email" type="email" className={inputCls} />
            <input value={form.phone} onChange={set('phone')} placeholder="Phone" className={inputCls} />
            <input value={form.dob} onChange={set('dob')} placeholder="DOB (YYYY-MM-DD)" className={inputCls} />
            <input value={form.gender} onChange={set('gender')} placeholder="Gender" className={inputCls} />
            <input value={form.category} onChange={set('category')} placeholder="Category (UR / SC / ST / OBC / EWS)" className={inputCls} />
          </div>
          <textarea
            value={form.declared_info}
            onChange={set('declared_info')}
            rows={3}
            placeholder="Declared qualifications & experience (what the candidate claims — screening verifies this against the documents)"
            className={inputCls}
          />
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Documents (PDFs — certificates, experience letters, resume)
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,image/*"
              onChange={(e) => setFiles(e.target.files)}
              className="text-sm text-foreground file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-border file:bg-card file:text-sm file:font-semibold file:text-foreground"
            />
            <p className="text-xs text-muted font-normal mt-1.5">
              Without documents the candidate is stored but skipped by screening (marked "no documents").
            </p>
          </div>

          {error && (
            <p className="text-sm font-medium text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="bg-card border border-border text-foreground font-semibold text-sm px-5 py-2.5 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={addCandidate.isPending || !form.external_id.trim()}
              className="bg-primary text-primary-foreground font-semibold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {addCandidate.isPending ? (<><Loader2 className="w-4 h-4 animate-spin" /> Adding…</>) : 'Add candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
