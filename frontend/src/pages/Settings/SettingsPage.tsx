import React from 'react';
import { Moon, LogOut, Mail, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="font-bold text-2xl text-foreground">Preferences</h1>
        <p className="text-sm text-muted font-normal mt-1">Account and appearance settings.</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4.5 h-4.5 text-primary" />
          <h2 className="font-semibold text-base text-foreground">Account</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{user?.email}</p>
            <p className="text-sm text-muted font-normal">HR reviewer</p>
          </div>
          <button
            onClick={() => logout()}
            className="bg-danger/10 text-danger border border-danger/20 font-semibold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Moon className="w-4.5 h-4.5 text-primary" />
          <h2 className="font-semibold text-base text-foreground">Appearance</h2>
        </div>
        <p className="text-sm text-muted font-normal">
          Toggle light/dark mode from the sun/moon icon in the top-right header.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Info className="w-4.5 h-4.5 text-primary" />
          <h2 className="font-semibold text-base text-foreground">About</h2>
        </div>
        <p className="text-sm text-muted font-normal leading-relaxed">
          RecruitAI Validator is IHMCL's automated recruitment screening system. It parses job
          description PDFs into structured criteria, extracts candidate data from uploaded documents,
          runs AI-assisted eligibility screening, and lets HR review, override, and export final results.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
