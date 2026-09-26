import React from "react";
import {
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  HelpCircle,
  LogOut,
  Menu,
  Moon,
  Settings2,
  Sun,
  Terminal,
  UserRound,
  XCircle,
} from "lucide-react";
import { apiRequest } from "../lib/api";

function JobIcon({ status }) {
  return status === "failed" ? (
    <XCircle size={15} />
  ) : status === "succeeded" ? (
    <CheckCircle2 size={15} />
  ) : (
    <Clock3 size={15} />
  );
}

export default function Topbar({
  user,
  light,
  onThemeToggle,
  onLogout,
  onMenu,
  onNavigate,
}) {
  const [jobs, setJobs] = React.useState([]);
  const [jobsOpen, setJobsOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [terminalSessions, setTerminalSessions] = React.useState(0);
  React.useEffect(() => {
    const update = (event) => setTerminalSessions(event.detail?.connected || 0);
    window.addEventListener("serverengine:terminal-status", update);
    return () =>
      window.removeEventListener("serverengine:terminal-status", update);
  }, []);
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      apiRequest("/api/v1/jobs")
        .then((response) => (response.ok ? response.json() : []))
        .then((items) => {
          if (alive) setJobs(items);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const cancelJob = async (job) => {
    setJobs((items) =>
      items.map((item) =>
        item.id === job.id
          ? {
              ...item,
              status: "cancelled",
              message: "Cancellation requested. Rolling back staged files…",
            }
          : item,
      ),
    );
    try {
      await apiRequest(`/api/v1/jobs/${job.id}/cancel`, { method: "POST" });
    } catch {}
  };
  const activeJobs = jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  ).length;
  const username = user?.username || "Administrator";
  const initial = username[0]?.toUpperCase() || "A";
  return (
    <header className="topbar !h-14 !bg-white dark:!bg-[#0b1220]">
      <button className="text-slate-400 md:hidden" onClick={onMenu}>
        <Menu size={22} />
      </button>
      <div className="ml-auto flex items-center gap-2">
        <button
          className="icon-button !rounded-full relative"
          aria-label="Open terminal"
          title="Open terminal"
          onClick={() => onNavigate("/terminal")}
        >
          <Terminal size={18} />
          {terminalSessions > 0 && (
            <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-4 text-white">
              {terminalSessions > 99 ? "99+" : terminalSessions}
            </span>
          )}
        </button>
        <div className="relative">
          <button
            className={`icon-button !rounded-full job-button ${activeJobs ? "job-button-active" : ""}`}
            aria-label="View operations"
            onClick={() => {
              setJobsOpen((value) => !value);
              setAccountOpen(false);
            }}
          >
            <Bell size={18} />
            {activeJobs > 0 && (
              <span className="job-badge">
                {activeJobs > 99 ? "99+" : activeJobs}
              </span>
            )}
          </button>
          {jobsOpen && (
            <div className="jobs-popover">
              <div className="jobs-popover-header">
                <div>
                  <strong>Operations</strong>
                  <p>
                    {activeJobs
                      ? `${activeJobs} active job${activeJobs === 1 ? "" : "s"}`
                      : "No active jobs"}
                  </p>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setJobsOpen(false)}
                  aria-label="Close operations"
                >
                  <XCircle size={16} />
                </button>
              </div>
              {jobs.length === 0 ? (
                <div className="jobs-empty">
                  Install and maintenance activity will appear here.
                </div>
              ) : (
                <div className="jobs-list">
                  {jobs.map((job) => (
                    <div className="job-row" key={job.id}>
                      <span className={`job-status job-status-${job.status}`}>
                        <JobIcon status={job.status} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <strong>{job.type}</strong>
                          {(job.status === "running" ||
                            job.status === "queued") && (
                            <button
                              className="shrink-0 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                              onClick={() => cancelJob(job)}
                            >
                              Cancel &amp; rollback
                            </button>
                          )}
                        </div>
                        <p>
                          {job.status} ·{" "}
                          {new Date(job.created_at).toLocaleTimeString()}
                        </p>
                        {job.progress != null &&
                          (job.status === "running" ||
                            job.status === "queued") && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                <div
                                  className="h-full rounded-full bg-blue-600 transition-all"
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                              <span className="text-[11px] tabular-nums text-slate-500">
                                {job.progress}%
                              </span>
                            </div>
                          )}
                        {job.message && <small>{job.message}</small>}
                        {job.status === "running" && job.log?.length > 0 && (
                          <pre>{job.log[job.log.length - 1]}</pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          className="icon-button !rounded-full"
          aria-label="Toggle theme"
          onClick={onThemeToggle}
        >
          {light ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => {
              setAccountOpen((value) => !value);
              setJobsOpen(false);
            }}
            aria-expanded={accountOpen}
          >
            <span className="hidden text-right sm:block">
              <strong className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                {username}
              </strong>
              <span className="block text-[11px] text-slate-500">
                Administrator
              </span>
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {initial}
            </span>
            <span className="hidden text-slate-400 sm:block">⌄</span>
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {username}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Administrator account
                </p>
              </div>
              <div className="p-2">
                <button
                  onClick={() => {
                    onNavigate("/account");
                    setAccountOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <UserRound size={16} />
                  Account settings
                </button>
                <button
                  onClick={() => {
                    onNavigate("/settings");
                    setAccountOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Settings2 size={16} />
                  Panel settings
                </button>
                <button
                  onClick={() => {
                    onNavigate("/logs");
                    setAccountOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ExternalLink size={16} />
                  View activity logs
                </button>
                <button
                  onClick={() => setAccountOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <HelpCircle size={16} />
                  Help and documentation
                </button>
              </div>
              <div className="border-t border-slate-200 p-2 dark:border-slate-800">
                <button
                  onClick={onLogout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
