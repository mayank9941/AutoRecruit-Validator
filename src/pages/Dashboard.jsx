import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Users,
  AlertCircle,
  UserCheck,
  FileText,
  Upload,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
  PlusCircle,
} from 'lucide-react';
import { getDashboardStats } from '../services/api';

// Animated counter hook
function useAnimatedCounter(target, duration = 1200) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (target === 0) return;
    let startTime = null;
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * target));
      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);

  return count;
}

function StatCard({ icon: Icon, label, value, change, changeType, iconClass }) {
  const animatedValue = useAnimatedCounter(value);

  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconClass}`}>
        <Icon size={24} />
      </div>
      <div className="stat-content">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{animatedValue}</div>
        {change && (
          <div className={`stat-change ${changeType}`}>
            <TrendingUp size={12} />
            {change}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const s = await getDashboardStats();
      setStats(s);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" style={{ animation: 'pulse 1.5s infinite' }}>
          <Briefcase size={36} />
        </div>
        <h3>Loading dashboard...</h3>
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Dashboard</h1>
          <p>Overview of your recruitment steps</p>
        </div>
        <div className="page-header-actions">
          <Link to="/job-profiles" className="btn btn-primary">
            <PlusCircle size={16} />
            New Profile
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid stagger-children">
        <StatCard
          icon={Briefcase}
          label="Active Profiles"
          value={stats.activeProfiles}
          change="+1 this week"
          changeType="up"
          iconClass="rose"
        />
        <StatCard
          icon={Users}
          label="Candidates Screened"
          value={stats.totalCandidatesScreened}
          change="+142 today"
          changeType="up"
          iconClass="green"
        />
        <StatCard
          icon={AlertCircle}
          label="Pending Review"
          value={stats.pendingReview}
          change="5 new"
          changeType="up"
          iconClass="amber"
        />
        <StatCard
          icon={UserCheck}
          label="Interview Ready"
          value={stats.interviewReady}
          change="+3 today"
          changeType="up"
          iconClass="blue"
        />
      </div>

      {/* Dashboard Actions */}
      <div className="dashboard-stack">
        {/* Quick Actions */}
        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <h3 className="card-title">Quick Actions</h3>
          </div>
          <div className="quick-actions dashboard-quick-actions">
            <Link to="/job-profiles" className="quick-action-card">
              <div className="quick-action-icon">
                <FileText size={22} />
              </div>
              <div className="quick-action-text">
                <h4>Define Job Profile</h4>
                <p>Create or edit criteria for a job opening</p>
              </div>
              <ArrowUpRight size={16} style={{ color: 'var(--text-muted)' }} />
            </Link>

            <Link to="/screening" className="quick-action-card">
              <div className="quick-action-icon">
                <Upload size={22} />
              </div>
              <div className="quick-action-text">
                <h4>Bulk Screen Candidates</h4>
                <p>Upload ZIP and Excel, then run screening</p>
              </div>
              <ArrowUpRight size={16} style={{ color: 'var(--text-muted)' }} />
            </Link>

            <Link to="/manual-review" className="quick-action-card">
              <div className="quick-action-icon" style={{ background: 'var(--status-review-bg)', color: 'var(--status-review)' }}>
                <AlertCircle size={22} />
              </div>
              <div className="quick-action-text">
                <h4>Manual Review</h4>
                <p>14 candidates need your attention</p>
              </div>
              <ArrowUpRight size={16} style={{ color: 'var(--text-muted)' }} />
            </Link>

            <Link to="/verification" className="quick-action-card">
              <div className="quick-action-icon" style={{ background: 'var(--status-verified-bg)', color: 'var(--status-verified)' }}>
                <ShieldCheck size={22} />
              </div>
              <div className="quick-action-text">
                <h4>Verify Documents</h4>
                <p>Compare application data with documents</p>
              </div>
              <ArrowUpRight size={16} style={{ color: 'var(--text-muted)' }} />
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
