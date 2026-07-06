import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
} from 'lucide-react';
import ihmclLogo from '../../assets/ihmcl-logo.png';
import { getRecentActivity } from '../../services/api';

const navItems = [
  {
    section: 'Overview',
    links: [
      { to: '/', icon: LayoutDashboard, label: 'Home' },
    ],
  },
  {
    section: 'Hiring Steps',
    links: [
      { to: '/job-profiles', icon: FileText, label: 'Job Description', step: 'Step 1' },
      { to: '/screening', icon: Users, label: 'Shortlist Candidates', step: 'Step 2' },
      { to: '/verification', icon: ShieldCheck, label: 'Approve for Interview', step: 'Step 3' },
    ],
  },
];

const activityIcons = {
  screening: Clock,
  eligible: CheckCircle2,
  review: AlertTriangle,
  profile: PlusCircle,
};

export default function Sidebar({ isOpen, onClose }) {
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    async function loadActivity() {
      const items = await getRecentActivity();
      setActivity(items);
    }
    loadActivity();
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14, 14, 14, 0.18)',
            zIndex: 99,
            display: 'none',
          }}
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <img src={ihmclLogo} alt="IHMCL logo" />
          </div>
          <div className="sidebar-brand-text">
            <h2>IHMCL</h2>
            <span>HR Screening</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((section) => (
            <div key={section.section}>
              <div className="sidebar-section-label">{section.section}</div>
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'active' : ''}`
                  }
                  end={link.to === '/'}
                  onClick={onClose}
                >
                  <link.icon />
                  <span>{link.label}</span>
                  {link.step && <span className="step-badge">{link.step}</span>}
                </NavLink>
              ))}
            </div>
          ))}

          <div className="sidebar-activity">
            <div className="sidebar-section-label">Recent Activity</div>
            <div className="sidebar-activity-list">
              {activity.map((item) => {
                const Icon = activityIcons[item.type] || Clock;
                return (
                  <div className="sidebar-activity-item" key={item.id}>
                    <div className={`sidebar-activity-dot ${item.color}`}>
                      <Icon size={12} />
                    </div>
                    <div className="sidebar-activity-content">
                      <div className="sidebar-activity-title">{item.title}</div>
                      <div className="sidebar-activity-time">{item.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </nav>

      </aside>
    </>
  );
}
