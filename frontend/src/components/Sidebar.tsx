import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  Briefcase,
  HelpCircle,
  FileCheck2,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/recruitment', end: false, icon: Briefcase, label: 'Job Profiles' },
  { to: '/document-verifier', end: false, icon: FileCheck2, label: 'Document Verifier' },
];

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const displayName = user?.email ? user.email.split('@')[0] : 'HR';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="w-64 bg-card border-r border-border h-screen flex flex-col fixed left-0 top-0 z-20">
      {/* Branding */}
      <div className="px-5 py-5 border-b border-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
          <img src="/ihmcl-logo.png" alt="IHMCL" className="w-7 h-7 object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="font-black text-foreground tracking-tight text-sm leading-tight">RecruitAI Validator</h1>
          <span className="text-[10px] font-bold text-muted tracking-widest uppercase">IHMCL Screening</span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <span className="px-2 mb-2 text-[9px] font-black uppercase tracking-widest text-muted/60">Main</span>
        {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-accent hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                )}
                <Icon className={`w-4.5 h-4.5 shrink-0 transition-colors ${isActive ? 'text-primary' : 'text-muted group-hover:text-foreground'}`} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-primary/50" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Account section */}
      <div className="px-3 pb-4 border-t border-border pt-3 flex flex-col gap-0.5">
        {/* User chip */}
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-black text-[10px] shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate capitalize">{displayName}</p>
            <p className="text-[10px] text-muted font-medium truncate">{user?.email}</p>
          </div>
        </div>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
              isActive ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-accent hover:text-foreground'
            }`
          }
        >
          <Settings className="w-4.5 h-4.5" />
          Preferences
        </NavLink>

        <button
          onClick={() => alert('IHMCL HR Screening Support\nFor queries email: support@ihmcl.example')}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:bg-accent hover:text-foreground transition-all duration-150 text-left w-full"
        >
          <HelpCircle className="w-4.5 h-4.5 shrink-0" />
          Help & Support
        </button>

        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-danger hover:bg-danger/10 transition-all duration-150 text-left w-full mt-1"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
