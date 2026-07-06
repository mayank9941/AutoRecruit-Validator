import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';

const pageTitles = {
  '/': 'Home',
  '/job-profiles': 'Job Description',
  '/screening': 'Shortlist Candidates',
  '/manual-review': 'Manual Review',
  '/verification': 'Approve for Interview',
};

const breadcrumbs = {
  '/': ['Home'],
  '/job-profiles': ['Hiring Steps', 'Job Description'],
  '/screening': ['Hiring Steps', 'Shortlist Candidates'],
  '/manual-review': ['Hiring Steps', 'Shortlist Candidates', 'Manual Review'],
  '/verification': ['Hiring Steps', 'Approve for Interview'],
};

export default function Header({ onMenuClick }) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Home';
  const crumbs = breadcrumbs[location.pathname] || ['Home'];

  return (
    <header className="header">
      <div className="header-left">
        <button
          className="mobile-menu-btn"
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <div>
          <div className="header-breadcrumb">
            {crumbs.map((crumb, i) => (
              <span key={i}>
                {i > 0 && <span className="separator"> / </span>}
                <span className={i === crumbs.length - 1 ? 'current' : ''}>
                  {crumb}
                </span>
              </span>
            ))}
          </div>
          <h1 className="header-title">{title}</h1>
        </div>
      </div>
    </header>
  );
}
