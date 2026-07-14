import { createContext, useContext, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "checking" -- initial /auth/me call in flight
  // "authenticated" | "unauthenticated" -- resolved
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    api
      .get("/auth/me")
      .then((data) => {
        setUser(data);
        setStatus("authenticated");
      })
      .catch(() => {
        setUser(null);
        setStatus("unauthenticated");
      });
  }, []);

  async function login(email, password) {
    const data = await api.post("/auth/login", { email, password });
    setUser(data);
    setStatus("authenticated");
    return data;
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Even if the request fails, clear local state so the UI reflects
      // "logged out" -- staying logged in visually would be worse.
    }
    setUser(null);
    setStatus("unauthenticated");
  }

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { ApiError };
