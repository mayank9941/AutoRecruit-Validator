import GlassCard from "../../components/GlassCard/GlassCard";
import Button from "../../components/Button/Button";
import { useAuth } from "../../context/AuthContext";

/**
 * TEMPORARY placeholder -- this will be replaced by the real Dashboard
 * page in the next build step. Its only job right now is to prove the
 * login -> session -> protected route flow works end-to-end.
 */
export default function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="glass-page">
      <div className="orb orb-1" style={{ width: 420, height: 420, top: -120, left: "6%", background: "radial-gradient(circle, rgba(23,23,26,0.16), transparent 70%)" }} />
      <div className="orb orb-2" style={{ width: 380, height: 380, top: "15%", right: -80, background: "radial-gradient(circle, rgba(120,120,124,0.22), transparent 70%)" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "80px 24px" }}>
        <GlassCard>
          <h1 style={{ fontSize: 26, marginBottom: 8 }}>You're logged in</h1>
          <p className="text-soft" style={{ marginBottom: 20 }}>
            Signed in as <strong>{user?.email}</strong>. This is a placeholder -- the real Dashboard
            comes next.
          </p>
          <Button variant="ghost" onClick={logout}>
            Log out
          </Button>
        </GlassCard>
      </div>
    </div>
  );
}
