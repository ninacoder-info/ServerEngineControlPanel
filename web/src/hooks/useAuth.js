import React from "react";
import { apiRequest, readApiError } from "../lib/api";
import { getPasskey } from "../lib/passkeys";

const EXPLICIT_LOGOUT_KEY = "serverengine:explicit-logout";

export function useAuth() {
  const [user, setUser] = React.useState(() => {
    try {
      return window.sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true" ? null : undefined;
    } catch {
      return undefined;
    }
  });
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    try {
      if (window.sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true") return undefined;
    } catch {
      // Continue with the server session check when sessionStorage is unavailable.
    }
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
        const body = await r.json().catch(() => ({}));
        const message = body.message || body.detail || "Invalid username or password";
        setError(message);
        return { ok: false, message, errors: body.errors || {}, retryAfter: Number(r.headers.get("retry-after") || 0) };
      }
      try {
        window.sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      } catch {
        // Session storage is an optimization only.
      }
      setUser(await r.json());
      return true;
    } catch {
      setError("The control API is unavailable.");
      return { ok: false, retryAfter: 0 };
    }
  }
  async function logout() {
    await apiRequest("/api/v1/auth/logout", { method: "POST" });
    try {
      window.sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, "true");
    } catch {
      // Session storage is an optimization only.
    }
    setUser(null);
  }
  async function passkeyLogin() {
    setError("");
    try {
      const optionsResponse = await apiRequest("/api/v1/auth/passkey/login/options", { method: "POST" });
      if (!optionsResponse.ok) throw new Error(await readApiError(optionsResponse, "Passkey sign-in is unavailable."));
      const credential = await getPasskey(await optionsResponse.json());
      const response = await apiRequest("/api/v1/auth/passkey/login/verify", {
        method: "POST",
        body: JSON.stringify({ credential }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Passkey sign-in failed."));
      try {
        window.sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      } catch {
        // Session storage is an optimization only.
      }
      setUser(await response.json());
      return true;
    } catch (reason) {
      setError(reason?.message || "Passkey sign-in failed.");
      return false;
    }
  }
  return { user, loading: user === undefined, error, login, passkeyLogin, logout };
}
