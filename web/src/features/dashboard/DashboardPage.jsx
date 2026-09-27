import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Globe2, HardDrive, Server } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { useTheme } from "../../hooks/useTheme";
import ActivityPanel from "./ActivityPanel";
import MetricCard from "./MetricCard";
import ServerPanel from "./ServerPanel";
import ServicesPage from "../services/ServicesPage";
import PhpRuntimesPage from "../services/PhpRuntimesPage";
import NodeRuntimesPage from "../services/NodeRuntimesPage";
import FileManagerPage from "../file-manager/FileManagerPage";
import SettingsPage from "../settings/SettingsPage";
import WebsitesPage from "../websites/WebsitesPage";
import ResourceMetricCards from "./ResourceMetricCards";
import DashboardWorkspace from "./DashboardWorkspace";
import DatabasesPage from "../databases/DatabasesPage";
import LogsPage from "../logs/LogsPage";
import UsersPage from "../users/UsersPage";
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
import WebProtectionPage from "../waf/WebProtectionPage";
import DockerPage from "../docker/DockerPage";
import PlansPage from "../plans/PlansPage";
import { useTranslation } from "../../lib/i18n";
export default function DashboardPage({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { t } = useTranslation();
  const active = location.pathname.startsWith("/websites")
    ? "Websites"
    : location.pathname === "/services/php"
      ? "PHP runtimes"
      : location.pathname === "/services/nodejs"
        ? "Node.js runtimes"
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
                      : location.pathname === "/docker"
                        ? "Containers"
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
                                ? "Accounts"
                                : location.pathname === "/plans"
                                  ? "Hosting plans"
                    : location.pathname === "/firewall"
                                  ? "Firewall"
                                  : location.pathname === "/application-shield"
                                    ? "Application Shield"
                                  : location.pathname === "/backups"
                                    ? "Backups"
                                    : location.pathname === "/databases"
                                      ? "Databases"
                                      : location.pathname === "/"
                                        ? "Overview"
                                        : location.pathname
                                            .slice(1)
                                            .replace(/^[a-z]/, (letter) =>
                                              letter.toUpperCase(),
                                            );
  const content = location.pathname.startsWith("/websites") ? (
    <WebsitesPage />
  ) : location.pathname === "/activity" ? (
    <ActivityPage />
  ) : location.pathname === "/cronjobs" ? (
    <CronJobsPage />
  ) : location.pathname === "/docker" ? (
    <DockerPage />
  ) : location.pathname === "/services/php" ? (
    <PhpRuntimesPage />
  ) : location.pathname === "/services/nodejs" ? (
    <NodeRuntimesPage />
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
    <UsersPage />
  ) : location.pathname === "/plans" ? (
    <PlansPage />
  ) : location.pathname === "/firewall" ? (
    <FirewallPage />
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
  ) : (
    <>
      <div>
        <p className="text-sm text-cyan-300">{t("dashboard.greeting")}</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">{location.pathname === "/" ? t("nav.overview") : active}</h2>
        <p className="mt-2 text-slate-400">
          {t("dashboard.apiOnline")}
        </p>
      </div>
      <ResourceMetricCards />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("dashboard.servers")}
          value="1"
          detail={t("dashboard.developmentNode")}
          icon={Server}
        />
        <MetricCard
          label={t("dashboard.websites")}
          value="0"
          detail={t("dashboard.noSites")}
          icon={Globe2}
        />
        <MetricCard
          label={t("dashboard.storage")}
          value="—"
          detail={t("dashboard.agentNotConnected")}
          icon={HardDrive}
        />
        <MetricCard
          label={t("dashboard.systemHealth")}
          value={t("dashboard.ready")}
          detail={t("dashboard.coreApiOnline")}
          icon={Activity}
          good
        />
      </section>
      <DashboardWorkspace onNavigate={navigate} />
      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <ServerPanel />
        <ActivityPanel />
      </section>
    </>
  );
  return (
    <div className={`app-shell ${theme.light ? "theme-light" : "dark"}`}>
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
