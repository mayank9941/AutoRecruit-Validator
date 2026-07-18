import React from 'react';
import { Moon, LogOut, Mail, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="font-black text-2xl text-foreground tracking-tight">Preferences</h1>
        <p className="text-xs text-muted font-medium mt-1">Account and appearance settings.</p>
      </div>

      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4.5 h-4.5 text-primary" />
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Account</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-foreground">{user?.email}</p>
            <p className="text-[11px] text-muted font-medium">HR reviewer</p>
          </div>
          <button
            onClick={() => logout()}
            className="bg-danger/10 text-danger border border-danger/20 font-bold text-xs px-4 py-2.5 rounded-2xl flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Moon className="w-4.5 h-4.5 text-primary" />
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Appearance</h2>
        </div>
        <p className="text-[11px] text-muted font-medium">
          Toggle light/dark mode from the sun/moon icon in the top-right header.
        </p>
      </div>

      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Info className="w-4.5 h-4.5 text-primary" />
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">About</h2>
        </div>
        <p className="text-[11px] text-muted font-medium leading-relaxed">
          RecruitAI Validator is IHMCL's automated recruitment screening system. It parses job
          description PDFs into structured criteria, extracts candidate data from uploaded documents,
          runs AI-assisted eligibility screening, and lets HR review, override, and export final results.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
