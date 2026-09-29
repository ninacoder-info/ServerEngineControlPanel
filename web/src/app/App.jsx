import React from "react";
import { Route, Routes } from "react-router-dom";
import LoginPage from "../features/auth/LoginPage";
import DashboardPage from "../features/dashboard/DashboardPage";
import { useAuth } from "../hooks/useAuth";
import { Toaster } from "sonner";

export default function App() {
  const auth = useAuth();
  const toaster = (
    <Toaster
      position="top-right"
      theme="system"
      expand
      visibleToasts={8}
      gap={10}
      offset={16}
      toastOptions={{
        unstyled: true,
        className: "!bg-transparent !p-0 !shadow-none",
      }}
    />
  );

  if (auth.loading)
    return (
      <>
        {toaster}
        <div
          className={`loading-screen ${
            localStorage.getItem("server-engine-theme") === "light"
              ? "theme-light"
              : ""
          }`}
        >
          Loading Server Engine…
        </div>
      </>
    );
  if (!auth.user)
    return (
      <>
        {toaster}
        <LoginPage
          onLogin={auth.login}
          onPasskeyLogin={auth.passkeyLogin}
          error={auth.error}
        />
      </>
    );
  return (
    <>
      {toaster}
      <Routes>
        <Route
          path="*"
          element={<DashboardPage user={auth.user} onLogout={auth.logout} />}
        />
      </Routes>
    </>
  );
}
