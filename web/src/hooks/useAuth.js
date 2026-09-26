import React from "react";
import { apiRequest, readApiError } from "../lib/api";
export function useAuth() {
  const [user, setUser] = React.useState(undefined);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((value) => {
        if (alive) setUser(value);
      })
      .catch(() => {
        if (alive) setUser(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function login(credentials) {
    setError("");
    try {
      const r = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      if (!r.ok) {
        setError(await readApiError(r, "Invalid username or password"));
        return false;
      }
      setUser(await r.json());
      return true;
    } catch {
      setError("The control API is unavailable.");
      return false;
    }
  }
  async function logout() {
    await apiRequest("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
  }
  return { user, loading: user === undefined, error, login, logout };
}
