import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';
import { useAuth, ApiError } from '../../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || 'Login failed');
      } else {
        setError('Could not reach the backend. Is it running?');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-sm p-8 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/ihmcl-logo.png" alt="IHMCL Logo" className="w-14 h-14 rounded-lg object-contain" />
          <div>
            <h1 className="font-serif font-bold text-foreground text-xl">RecruitAI Validator</h1>
            <p className="text-sm text-muted font-normal mt-1">IHMCL HR screening system</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-sm font-medium text-foreground">HR email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hr@ihmcl.com"
              required
              className="bg-slate-500/5 border border-border text-foreground text-base font-normal px-4 py-3.5 rounded-lg w-full outline-none focus:border-primary transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-sm font-medium text-foreground">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-slate-500/5 border border-border text-foreground text-base font-normal px-4 py-3.5 rounded-lg w-full outline-none focus:border-primary transition-all"
            />
          </div>

          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg flex items-start gap-2 text-sm font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground font-semibold text-base px-5 py-3.5 rounded-lg flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 hover:opacity-90 transition-opacity"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-muted text-center font-normal leading-relaxed">
          HR accounts are provisioned by an admin via <code>scripts/create_hr_user.py</code> — there's
          no self-signup by design.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
