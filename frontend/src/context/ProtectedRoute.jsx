import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Wraps a route so it redirects to /login if there's no valid session.
 * Shows nothing (briefly) while the initial /auth/me check is in flight,
 * to avoid a flash of the login page for someone who's actually logged in.
 */
export default function ProtectedRoute({ children }) {
  const { status } = useAuth();

  if (status === "checking") return null;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;

  return children;
}
