import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { useTheme } from "../../hooks/useTheme";
import ActivityPanel from "./ActivityPanel";
import OverviewSummary from "./OverviewSummary";
import ServerPanel from "./ServerPanel";
import ServicesPage from "../services/ServicesPage";
import NodeRuntimesPage from "../services/NodeRuntimesPage";
import PhpRuntimesPage from "../services/PhpRuntimesPage";
import FileManagerPage from "../file-manager/FileManagerPage";
import SettingsPage from "../settings/SettingsPage";
import WebsitesPage from "../websites/WebsitesPage";
import ResourceMetricCards from "./ResourceMetricCards";
import DashboardWorkspace from "./DashboardWorkspace";
import DatabasesPage from "../databases/DatabasesPage";
import LogsPage from "../logs/LogsPage";
import UsersPage from "../users/UsersPage";
import PanelUsersPage from "../users/PanelUsersPage";
import RolesPage from "../users/RolesPage";
import FirewallPage from "../firewall/FirewallPage";
import BackupsPage from "../backups/BackupsPage";
import ServerHealthPage from "../health/ServerHealthPage";
import DomainsPage from "../domains/DomainsPage";
import EmailPage from "../email/EmailPage";
import FTPPage from "../ftp/FTPPage";
import AccountSettingsPage from "../account/AccountSettingsPage";
import TerminalPage from "../terminal/TerminalPage";
import ActivityPage from "../activity/ActivityPage";
import CronJobsPage from "../cron/CronJobsPage";
import SupervisorWorkspace from "../services/SupervisorWorkspace";
import WebProtectionPage from "../waf/WebProtectionPage";
import MalwareScannerPage from "../malware/MalwareScannerPage";
import DockerPage from "../docker/DockerPage";
import DockerContainerDetailsPage from "../docker/DockerContainerDetailsPage";
import DockerImageDetailsPage from "../docker/DockerImageDetailsPage";
import PlansPage from "../plans/PlansPage";
import { useTranslation } from "../../lib/i18n";
import { apiRequest } from "../../lib/api";
import {
  applyPanelPreferences,
  readPanelPreferences,
} from "../../lib/panelPreferences";

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-label="Loading overview">
      <header className="space-y-3">
        <div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-9 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-4 w-80 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="h-4 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" />
            <div className="mt-5 h-8 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-2 h-3 w-32 rounded bg-neutral-100 dark:bg-neutral-800/70" />
            <div className="mt-4 h-10 rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="space-y-2">
              <div className="h-4 w-28 rounded bg-neutral-100 dark:bg-neutral-800/70" />
              <div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-64 rounded bg-neutral-100 dark:bg-neutral-800/70" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: index ? 3 : 4 }).map((__, item) => (
                <div
                  key={item}
                  className="h-20 rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/40"
                />
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 3 }).map((__, row) => (
                <div key={row} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                  <div className="h-4 flex-1 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function DashboardPage({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [panelPreferences, setPanelPreferences] =
    React.useState(readPanelPreferences);
  const overviewLoading = false;
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { t } = useTranslation();
  React.useEffect(() => {
    const update = (event) =>
      setPanelPreferences(event.detail || readPanelPreferences());
    window.addEventListener("serverengine:panel-settings-change", update);
    return () =>
      window.removeEventListener("serverengine:panel-settings-change", update);
  }, []);
  React.useEffect(() => {
    let active = true;
    apiRequest("/api/v1/settings/panel")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active && body?.values) {
          // A top-bar theme toggle is local to this browser. Do not let an
          // older server-side `system` value overwrite it during boot.
          const local = readPanelPreferences();
          const values = {
            ...body.values,
            ...(body.values.panel_theme === "system" &&
            (local.panel_theme === "dark" || local.panel_theme === "light")
              ? { panel_theme: local.panel_theme }
              : {}),
          };
          setPanelPreferences(values);
          applyPanelPreferences(values);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  React.useEffect(() => {
    const landing = panelPreferences.panel_landing;
    if (location.pathname === "/" && landing && landing !== "overview") {
      navigate(`/${landing}`);
    }
  }, [location.pathname, navigate, panelPreferences.panel_landing]);
  const active = location.pathname.startsWith("/websites")
    ? "Websites"
    : location.pathname === "/services/nodejs"
      ? "Node.js runtimes"
      : location.pathname === "/services/php"
        ? "PHP runtimes"
        : location.pathname.startsWith("/services")
          ? "Services"
          : location.pathname === "/file-manager"
            ? "File Manager"
            : location.pathname === "/domains"
              ? "Domains & DNS"
              : location.pathname === "/email"
                ? "Email"
                : location.pathname === "/ftp"
                  ? "FTP Accounts"
                  : location.pathname === "/activity"
                    ? "Activity"
                    : location.pathname === "/cronjobs"
                      ? "Cron jobs"
                      : location.pathname === "/supervisor"
                        ? "Supervisor"
                        : location.pathname.startsWith("/docker")
                          ? "Docker"
                          : location.pathname === "/health"
                            ? "Server health"
                            : location.pathname === "/settings"
                              ? "Settings"
                              : location.pathname === "/account"
                                ? "Account settings"
                                : location.pathname === "/terminal"
                                  ? "Terminal"
                                  : location.pathname === "/logs"
                                    ? "Logs"
                                      : location.pathname === "/users"
                                      ? "Panel users"
                                      : location.pathname === "/roles"
                                        ? "Roles & permissions"
                                      : location.pathname === "/hosting-accounts"
                                        ? "Hosting accounts"
                                      : location.pathname === "/plans"
                                        ? "Hosting plans"
                                        : location.pathname === "/firewall"
                                          ? "Firewall"
                                          : location.pathname ===
                                              "/malware-scanner"
                                            ? "Malware Scanner"
                                            : location.pathname ===
                                                "/application-shield"
                                              ? "Application Shield"
                                              : location.pathname === "/backups"
                                                ? "Backups"
                                                : location.pathname ===
                                                    "/databases"
                                                  ? "Databases"
                                                  : location.pathname === "/"
                                                    ? "Overview"
                                                    : location.pathname
                                                        .slice(1)
                                                        .replace(
                                                          /^[a-z]/,
                                                          (letter) =>
                                                            letter.toUpperCase(),
                                                        );
  const content = location.pathname.startsWith("/websites") ? (
    <WebsitesPage />
  ) : location.pathname === "/activity" ? (
    <ActivityPage />
  ) : location.pathname === "/cronjobs" ? (
    <CronJobsPage />
  ) : location.pathname === "/supervisor" ? (
    <SupervisorWorkspace />
  ) : location.pathname.startsWith("/docker/images/") ? (
    <DockerImageDetailsPage />
  ) : location.pathname.startsWith("/docker/containers/") ? (
    <DockerContainerDetailsPage />
  ) : location.pathname.startsWith("/docker") ? (
    <DockerPage />
  ) : location.pathname === "/services/nodejs" ? (
    <NodeRuntimesPage />
  ) : location.pathname === "/services/php" ? (
    <PhpRuntimesPage />
  ) : location.pathname === "/file-manager" ? (
    <FileManagerPage />
  ) : location.pathname === "/domains" ? (
    <DomainsPage />
  ) : location.pathname === "/email" ? (
    <EmailPage />
  ) : location.pathname === "/ftp" ? (
    <FTPPage />
  ) : location.pathname === "/databases" ? (
    <DatabasesPage />
  ) : location.pathname === "/logs" ? (
    <LogsPage />
  ) : location.pathname === "/users" ? (
    <PanelUsersPage />
  ) : location.pathname === "/roles" ? (
    <RolesPage />
  ) : location.pathname === "/hosting-accounts" ? (
    <UsersPage />
  ) : location.pathname === "/plans" ? (
    <PlansPage />
  ) : location.pathname === "/firewall" ? (
    <FirewallPage />
  ) : location.pathname === "/malware-scanner" ? (
    <MalwareScannerPage />
  ) : location.pathname === "/application-shield" ? (
    <WebProtectionPage />
  ) : location.pathname === "/backups" ? (
    <BackupsPage />
  ) : location.pathname === "/health" ? (
    <ServerHealthPage />
  ) : location.pathname === "/settings" ? (
    <SettingsPage />
  ) : location.pathname === "/account" ? (
    <AccountSettingsPage user={user} />
  ) : location.pathname === "/terminal" ? null : active === "Services" ? (
    <ServicesPage />
  ) : location.pathname === "/" && overviewLoading ? (
    <OverviewSkeleton />
  ) : (
    <>
      <div>
        <p className="text-sm text-cyan-300">{t("dashboard.greeting")}</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">
          {location.pathname === "/" ? t("nav.overview") : active}
        </h2>
        <p className="mt-2 text-neutral-400">{t("dashboard.apiOnline")}</p>
      </div>
      <ResourceMetricCards />
      <OverviewSummary onNavigate={navigate} />
      <DashboardWorkspace onNavigate={navigate} />
      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <ServerPanel />
        <ActivityPanel />
      </section>
    </>
  );
  return (
    <div
      className="min-h-screen bg-[var(--se-bg)] text-[var(--se-text)]"
      data-show-hints={panelPreferences.panel_show_hints !== false}
    >
      <Sidebar
        open={menuOpen}
        active={active}
        onSelect={(path) => navigate(path)}
        onClose={() => setMenuOpen(false)}
      />
      {menuOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="md:pl-64">
        <Topbar
          user={user}
          light={theme.light}
          onThemeToggle={theme.toggle}
          onLogout={onLogout}
          onMenu={() => setMenuOpen(true)}
          onNavigate={navigate}
        />
        <div className="mx-auto max-w-7xl space-y-8 p-5 md:p-10">
          {content}
          <div className={location.pathname === "/terminal" ? "" : "hidden"}>
            <TerminalPage autoConnect={location.pathname === "/terminal"} />
          </div>
        </div>
      </main>
    </div>
  );
}
