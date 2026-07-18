import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Moon, Sun, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BASE_URL } from '../lib/api';

interface MainLayoutProps {
  children: React.ReactNode;
}

const ROUTE_TITLES: { pattern: RegExp; title: string; subtitle: string }[] = [
  { pattern: /^\/$/, title: 'Dashboard', subtitle: 'Live overview of all screening activity.' },
  { pattern: /^\/recruitment\/[^/]+\//, title: 'Candidate Review', subtitle: 'Detailed criterion-by-criterion breakdown.' },
  { pattern: /^\/recruitment\/[^/]+$/, title: 'Job Profile', subtitle: 'Manage criteria, upload candidates, and run screening.' },
  { pattern: /^\/recruitment$/, title: 'Job Profiles', subtitle: 'All active job profiles and JD uploads.' },
  { pattern: /^\/candidate\//, title: 'Candidate Review', subtitle: 'Criterion evaluations and HR override.' },
  { pattern: /^\/document-verifier\//, title: 'Document Verifier', subtitle: 'Cross-check candidate documents against form data.' },
  { pattern: /^\/document-verifier$/, title: 'Document Verifier', subtitle: 'Select a candidate to verify their documents.' },
  { pattern: /^\/reports\//, title: 'Screening Results', subtitle: 'Filtered candidate results and Excel export.' },
  { pattern: /^\/settings$/, title: 'Preferences', subtitle: 'Account and appearance settings.' },
];

function useRouteTitle(pathname: string) {
  for (const { pattern, title, subtitle } of ROUTE_TITLES) {
    if (pattern.test(pathname)) return { title, subtitle };
  }
  return { title: 'RecruitAI Validator', subtitle: '' };
}

function useBackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${BASE_URL}/`, { credentials: 'include' });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return online;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const { title, subtitle } = useRouteTitle(location.pathname);
  const backendOnline = useBackendStatus();

  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('ihmcl_theme') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('ihmcl_theme', theme);
  }, [theme]);

  const displayName = user?.email ? user.email.split('@')[0] : 'HR';

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />

      <div className="flex-1 pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 bg-card/80 backdrop-blur border-b border-border px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex flex-col justify-center">
            <h2 className="font-black text-foreground text-base leading-tight tracking-tight">{title}</h2>
            {subtitle && <p className="text-[11px] text-muted font-medium leading-tight mt-0.5">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            {/* Backend status — only shown once resolved */}
            {backendOnline === true && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success/10 border border-success/20 text-success text-[11px] font-bold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                Connected
              </div>
            )}
            {backendOnline === false && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-danger/10 border border-danger/20 text-danger text-[11px] font-bold">
                <WifiOff className="w-3 h-3" />
                Offline
              </div>
            )}

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              className="p-2 border border-border rounded-lg bg-card text-foreground hover:bg-accent transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark'
                ? <Sun className="w-3.5 h-3.5 text-amber-400" />
                : <Moon className="w-3.5 h-3.5 text-muted" />}
            </button>

            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-[10px] shadow-sm uppercase">
              {displayName.slice(0, 2)}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;
