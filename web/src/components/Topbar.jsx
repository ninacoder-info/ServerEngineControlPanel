import React from "react";
import {
  Bell,
  CheckCircle2,
  Check,
  Clock3,
  Copy,
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
import Toast from "./Toast";
import { formatPanelDate } from "../lib/panelPreferences";
import { setJobFavicon } from "../lib/jobFavicon";
import englishFlag from "../assets/flags/en.svg";
import vietnameseFlag from "../assets/flags/vi.svg";
import frenchFlag from "../assets/flags/fr.svg";

const languages = [
  { id: "en", label: "English", short: "EN", flag: englishFlag },
  { id: "vi", label: "Tiếng Việt", short: "VI", flag: vietnameseFlag },
  { id: "fr", label: "Français", short: "FR", flag: frenchFlag },
];

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
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [selectedJobId, setSelectedJobId] = React.useState(null);
  const [language, setLanguage] = React.useState(
    () => localStorage.getItem("server-engine-language") || "en",
  );
  const [terminalSessions, setTerminalSessions] = React.useState(0);
  const [operationToast, setOperationToast] = React.useState(null);
  const [copiedJobId, setCopiedJobId] = React.useState(null);
  const jobsInitialized = React.useRef(false);
  const previousJobStatuses = React.useRef(new Map());
  const activeJobsRef = React.useRef(0);
  const faviconResetTimer = React.useRef(null);
  const jobsRef = React.useRef(null);
  const accountRef = React.useRef(null);
  const languageRef = React.useRef(null);
  const jobOutputRef = React.useRef(null);
  const jobOutputFollowRef = React.useRef(true);
  React.useEffect(() => {
    const closeMenus = (event) => {
      if (!jobsRef.current?.contains(event.target)) setJobsOpen(false);
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
      if (!languageRef.current?.contains(event.target)) setLanguageOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);
  React.useEffect(() => {
    const update = (event) => setTerminalSessions(event.detail?.connected || 0);
    window.addEventListener("serverengine:terminal-status", update);
    return () =>
      window.removeEventListener("serverengine:terminal-status", update);
  }, []);
  React.useEffect(() => {
    const updateLanguage = (event) => {
      if (event.detail?.language) setLanguage(event.detail.language);
    };
    window.addEventListener("serverengine:language-change", updateLanguage);
    return () => window.removeEventListener("serverengine:language-change", updateLanguage);
  }, []);
  React.useEffect(() => {
    let alive = true;
    let socket;
    let reconnectTimer;
    const applySnapshot = (items) => {
      if (!alive) return;
      previousJobStatuses.current = new Map(items.map((job) => [job.id, job.status]));
      activeJobsRef.current = items.filter(
        (job) => job.status === "queued" || job.status === "running",
      ).length;
      setJobFavicon(activeJobsRef.current ? "processing" : "idle");
      jobsInitialized.current = true;
      setJobs(items);
    };
    const applyJob = (job) => {
      if (!alive) return;
      const previous = previousJobStatuses.current.get(job.id);
      const finished = ["succeeded", "failed", "cancelled"].includes(job.status);
      const statusChanged = previous !== job.status;
      const nextStatuses = new Map(previousJobStatuses.current);
      nextStatuses.set(job.id, job.status);
      activeJobsRef.current = [...nextStatuses.values()].filter(
        (status) => status === "queued" || status === "running",
      ).length;
      if (activeJobsRef.current) {
        setJobFavicon("processing");
      } else if (finished && statusChanged) {
        setJobFavicon(job.status === "succeeded" ? "success" : "failed");
        window.clearTimeout(faviconResetTimer.current);
        faviconResetTimer.current = window.setTimeout(() => {
          if (activeJobsRef.current === 0) setJobFavicon("idle");
        }, 5000);
      }
      if (jobsInitialized.current && previous !== job.status && finished) {
        setOperationToast({
          type: job.status === "succeeded" ? "success" : "error",
          message: job.message || `${job.type} ${job.status}.`,
        });
      }
      previousJobStatuses.current.set(job.id, job.status);
      setJobs((current) => {
        const next = current.filter((item) => item.id !== job.id);
        next.unshift(job);
        return next;
      });
      if (jobsInitialized.current && statusChanged) {
        window.dispatchEvent(new CustomEvent("serverengine:jobs-updated"));
      }
      if (statusChanged) {
        const actionMatch = String(job.type || "").match(/^(Start|Stop|Restart|Install|Uninstall)\s+([^\s·]+)/i);
        if (actionMatch) {
          const action = actionMatch[1].toLowerCase();
          const serviceId = actionMatch[2].toLowerCase();
          window.dispatchEvent(
            new CustomEvent("serverengine:service-status", {
              detail: {
                serviceId,
                action,
                status: job.status,
                running: job.status === "succeeded" && ["start", "restart"].includes(action),
                installed: job.status === "succeeded" && action === "install",
                job,
              },
            }),
          );
        }
      }
      jobsInitialized.current = true;
    };
    const connect = () => {
      if (!alive) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/jobs/ws`);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "snapshot") applySnapshot(message.jobs || []);
          if (message.type === "job" && message.job) applyJob(message.job);
        } catch {}
      };
      socket.onclose = () => {
        if (alive) reconnectTimer = window.setTimeout(connect, 2000);
      };
    };
    const connectTimer = window.setTimeout(connect, 0);
    return () => {
      alive = false;
      window.clearTimeout(connectTimer);
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(faviconResetTimer.current);
      setJobFavicon("idle");
      socket?.close();
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
  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const copyJobOutput = async (job) => {
    const details = [
      job.type,
      `${job.status} · started ${formatPanelDate(job.created_at)}`,
      job.message,
      ...(job.log || []),
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(details);
      setCopiedJobId(job.id);
      window.setTimeout(() => setCopiedJobId((current) => current === job.id ? null : current), 1800);
    } catch {
      setOperationToast({ type: "error", message: "Unable to copy the job output." });
    }
  };
  React.useEffect(() => {
    jobOutputFollowRef.current = true;
  }, [selectedJobId]);
  React.useLayoutEffect(() => {
    const output = jobOutputRef.current;
    if (!output || !jobOutputFollowRef.current) return;
    output.scrollTop = output.scrollHeight;
  }, [selectedJob?.log?.length]);
  const username = user?.username || "Administrator";
  const initial = username[0]?.toUpperCase() || "A";
  const selectedLanguage = languages.find((item) => item.id === language) || languages[0];
  const changeLanguage = (next) => {
    setLanguage(next);
    localStorage.setItem("server-engine-language", next);
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent("serverengine:language-change", { detail: { language: next } }));
    setLanguageOpen(false);
  };
  return (
    <header className="topbar sticky top-0 z-30 !h-14 !bg-white dark:!bg-[#0b1220]">
      <button className="text-slate-400 md:hidden" onClick={onMenu}>
        <Menu size={22} />
      </button>
      <div className="ml-auto flex items-center gap-2">
        <a
          href="/terminal"
          className="icon-button !rounded-full relative"
          aria-label="Open terminal"
          title="Open terminal"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/terminal");
          }}
        >
          <Terminal size={18} />
          {terminalSessions > 0 && (
            <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-4 text-white">
              {terminalSessions > 99 ? "99+" : terminalSessions}
            </span>
          )}
        </a>
        <div className="relative" ref={jobsRef}>
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
                    <div
                      className="job-row cursor-pointer"
                      key={job.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedJobId(job.id);
                        setJobsOpen(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedJobId(job.id);
                          setJobsOpen(false);
                        }
                      }}
                    >
                      <span className={`job-status job-status-${job.status}`}>
                        <JobIcon status={job.status} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <strong>{job.type}</strong>
                          {(job.status === "running" ||
                            job.status === "queued") && (
                            <button
                              className="shrink-0 cursor-pointer text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                              onClick={(event) => {
                                event.stopPropagation();
                                cancelJob(job);
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        <p>
                          {job.status} ·{" "}
                          {formatPanelDate(job.created_at)}
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
                        {job.log?.length > 0 && (
                          <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4">
                            {job.log.slice(-6).join("\n")}
                          </pre>
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
        <div className="relative" ref={languageRef}>
          <button
            type="button"
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Choose language"
            aria-expanded={languageOpen}
            onClick={() => {
              setLanguageOpen((value) => !value);
              setAccountOpen(false);
              setJobsOpen(false);
            }}
          >
            <img src={selectedLanguage.flag} alt="" className="h-4 w-6 rounded-sm object-cover" />
          </button>
          {languageOpen && (
            <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <p className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Language</p>
              {languages.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${language === item.id ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                  onClick={() => changeLanguage(item.id)}
                >
                  <img src={item.flag} alt="" className="h-4 w-6 rounded-sm object-cover" />
                  <span>{item.label}</span>
                  {language === item.id && <span className="ml-auto text-blue-600">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" ref={accountRef}>
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
                <a
                  href="/account"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate("/account");
                    setAccountOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Account settings"
                >
                  <UserRound size={16} />
                  Account settings
                </a>
                <a
                  href="/settings"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate("/settings");
                    setAccountOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Panel settings"
                >
                  <Settings2 size={16} />
                  Panel settings
                </a>
                <a
                  href="/logs"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate("/logs");
                    setAccountOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="View activity logs"
                >
                  <ExternalLink size={16} />
                  View activity logs
                </a>
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
      {selectedJob && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8"
          role="presentation"
        >
          <section
            className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-log-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Terminal size={17} className="text-blue-600 dark:text-blue-400" />
                  <h2 id="job-log-title" className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                    {selectedJob.type}
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedJob.status} · started {formatPanelDate(selectedJob.created_at)}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close job log"
                onClick={() => setSelectedJobId(null)}
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {selectedJob.progress != null && (
                <div className="flex items-center gap-3">
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${selectedJob.progress}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {selectedJob.progress}%
                  </span>
                </div>
              )}
              {selectedJob.message && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {selectedJob.message}
                </p>
              )}
              <div className="overflow-hidden rounded-lg bg-slate-950 shadow-inner">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Job output
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                    aria-label="Copy job output"
                    title="Copy job output"
                    onClick={() => copyJobOutput(selectedJob)}
                  >
                    {copiedJobId === selectedJob.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
                <pre
                  ref={jobOutputRef}
                  onScroll={(event) => {
                    const output = event.currentTarget;
                    const distanceFromBottom =
                      output.scrollHeight - output.scrollTop - output.clientHeight;
                    jobOutputFollowRef.current = distanceFromBottom <= 24;
                  }}
                  className="max-h-[60vh] min-h-56 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-slate-300"
                >
                  {selectedJob.log?.length
                    ? selectedJob.log.join("\n")
                    : "Waiting for job output…"}
                </pre>
              </div>
              {(selectedJob.status === "running" || selectedJob.status === "queued") && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="cursor-pointer text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                    onClick={() => cancelJob(selectedJob)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      <Toast
        message={operationToast?.message}
        type={operationToast?.type}
        onClose={() => setOperationToast(null)}
      />
    </header>
  );
}
