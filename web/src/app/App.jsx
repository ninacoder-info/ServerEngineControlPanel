import React from "react";
import { Route, Routes } from "react-router-dom";
import LoginPage from "../features/auth/LoginPage";
import DashboardPage from "../features/dashboard/DashboardPage";
import { useAuth } from "../hooks/useAuth";
export default function App() {
  const auth = useAuth();
  if (auth.loading)
    return <div className="loading-screen">Loading Server Engine…</div>;
  if (!auth.user) return <LoginPage onLogin={auth.login} error={auth.error} />;
  return (
    <Routes>
      <Route
        path="*"
        element={<DashboardPage user={auth.user} onLogout={auth.logout} />}
      />
    </Routes>
  );
}
