import Sidebar from "../../components/Sidebar/Sidebar";
import "./AppLayout.css";

/**
 * Wraps every page except Login. Provides the persistent sidebar, the
 * page background (gradient + blurred orbs), and a consistent content
 * area width/padding so individual pages don't have to repeat this.
 */
export default function AppLayout({ children }) {
  return (
    <div className="glass-page app-layout">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <Sidebar />

      <main className="app-content">{children}</main>
    </div>
  );
}
