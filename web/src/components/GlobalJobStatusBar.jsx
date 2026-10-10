import React from "react";
import {
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  Globe2,
  Layers3,
  LoaderCircle,
  Server,
  ShieldCheck,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { apiRequest } from "../lib/api";

function statusIcon(status) {
  if (status === "idle")
    return <span className="block h-2.5 w-2.5 rounded-full bg-white/70" />;
  if (status === "succeeded") return <CheckCircle2 size={17} />;
  if (status === "failed" || status === "cancelled")
    return <CircleAlert size={17} />;
  return <LoaderCircle className="animate-spin" size={17} />;
}

export default function GlobalJobStatusBar({
  onOpenTerminal,
  onOpenLogs,
  onOpenServer,
  onOpenService,
  terminalOpen = false,
  panel = "terminal",
}) {
  const [jobs, setJobs] = React.useState([]);
  const [services, setServices] = React.useState([]);
  const [shieldPolicy, setShieldPolicy] = React.useState(null);
  const [logSummary, setLogSummary] = React.useState(null);
  const [terminalSessions, setTerminalSessions] = React.useState(0);
  const [uploadState, setUploadState] = React.useState(null);
  const activeJob = jobs.find(
    (job) => job.status === "running" || job.status === "queued",
  );
  const job = activeJob || jobs[0];

  React.useEffect(() => {
    const onUploadStatus = (event) => {
      const detail = event.detail;
      if (!detail) return;
      setUploadState(detail.active ? detail : null);
    };
    window.addEventListener("serverengine:file-upload", onUploadStatus);
    return () =>
      window.removeEventListener("serverengine:file-upload", onUploadStatus);
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/jobs")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => alive && Array.isArray(items) && setJobs(items))
      .catch(() => {});
    const onSnapshot = (event) => {
      const items = event.detail?.jobs;
      if (Array.isArray(items)) setJobs(items);
    };
    const onUpdate = (event) => {
      const update = event.detail?.job;
      if (!update) return;
      setJobs((current) => [
        update,
        ...current.filter((item) => item.id !== update.id),
      ]);
    };
    window.addEventListener("serverengine:jobs-snapshot", onSnapshot);
    window.addEventListener("serverengine:jobs-updated", onUpdate);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:jobs-snapshot", onSnapshot);
      window.removeEventListener("serverengine:jobs-updated", onUpdate);
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/logs/summary")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => alive && value && setLogSummary(value))
      .catch(() => {});
    const onLogsUpdated = (event) => {
      if (event.detail?.summary) setLogSummary(event.detail.summary);
    };
    window.addEventListener("serverengine:logs-updated", onLogsUpdated);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:logs-updated", onLogsUpdated);
    };
  }, []);

  React.useEffect(() => {
    const onTerminalStatus = (event) =>
      setTerminalSessions(Number(event.detail?.connected || 0));
    window.addEventListener("serverengine:terminal-status", onTerminalStatus);
    return () =>
      window.removeEventListener(
        "serverengine:terminal-status",
        onTerminalStatus,
      );
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/application-shield/overview")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => alive && value?.policy && setShieldPolicy(value.policy))
      .catch(() => {});
    const onPolicy = (event) => {
      if (event.detail) setShieldPolicy(event.detail);
    };
    window.addEventListener("serverengine:application-shield-policy", onPolicy);
    return () => {
      alive = false;
      window.removeEventListener(
        "serverengine:application-shield-policy",
        onPolicy,
      );
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/services/installed")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => alive && Array.isArray(items) && setServices(items))
      .catch(() => {});
    const onServiceStatus = (event) => {
      const detail = event.detail || {};
      if (
        !detail.serviceId ||
        !["start", "stop", "restart"].includes(detail.action)
      )
        return;
      if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;
      setServices((current) =>
        current.map((item) => {
          if (
            item.id !== detail.serviceId &&
            !item.id.startsWith(`${detail.serviceId}@`)
          )
            return item;
          if (detail.status !== "succeeded") return item;
          const running = detail.action !== "stop";
          return { ...item, status: running ? "running" : "stopped", running };
        }),
      );
    };
    window.addEventListener("serverengine:service-status", onServiceStatus);
    return () => {
      alive = false;
      window.removeEventListener(
        "serverengine:service-status",
        onServiceStatus,
      );
    };
  }, []);

  const status = job?.status || "idle";
  const progress = job
    ? Math.max(0, Math.min(100, Number(job.progress || 0)))
    : 0;
  const uploadProgress = uploadState
    ? Math.max(0, Math.min(100, Number(uploadState.progress || 0)))
    : 0;
  const displayStatus = uploadState
    ? `${uploadProgress}%`
    : job
      ? status
      : "Ready";
  const displayTitle = uploadState
    ? `Uploading ${uploadState.name || "files"}`
    : job?.type || "Server Engine";
  const tone = "text-white";
  const profile = {
    id: "global-job-terminal",
    name: "Local Server",
    kind: "local",
    username: "root",
  };
  const webServer = ["nginx", "apache", "openlitespeed", "caddy", "haproxy"]
    .map((id) =>
      services.find((item) => item.id === id || item.id.startsWith(`${id}@`)),
    )
    .find(Boolean);
  const mysql = services.find(
    (item) => item.id === "mysql" || item.id === "mariadb",
  );
  const sqlserver = services.find((item) => item.id === "sqlserver");
  const redis = services.find(
    (item) => item.id === "redis" || item.id === "valkey",
  );
  const shield = services.find((item) => item.id === "modsecurity");
  const logSize = Number(logSummary?.size || 0);
  const logWarningBytes = 50 * 1024 * 1024;
  const logDangerBytes = 100 * 1024 * 1024;
  const logTone =
    logSize >= logDangerBytes
      ? "bg-rose-300"
      : logSize >= logWarningBytes
        ? "bg-amber-300"
        : "bg-emerald-300";
  const logHealth =
    logSize >= logDangerBytes
      ? "Too large"
      : logSize >= logWarningBytes
        ? "Large"
        : "Healthy";
  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };
  const StatusTooltip = ({ label, children }) => (
    <span className="group/status-tooltip relative inline-flex">
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/status-tooltip:opacity-100 dark:bg-white dark:text-neutral-900">
        {label}
      </span>
      {children}
    </span>
  );
  const serviceButton = (item, Icon) => {
    if (!item) return null;
    const running = item.status === "running" || item.running === true;
    return (
      <StatusTooltip
        label={`${item.name || item.id} is ${running ? "running" : "stopped"}`}
      >
        <button
          type="button"
          aria-label={`Open ${item.name || item.id} configuration`}
          className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15"
          onClick={() => onOpenService?.(item)}
        >
          <Icon size={13} />
          <span className="hidden xl:inline">{item.name || item.id}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-300" : "bg-amber-300"}`}
          />
        </button>
      </StatusTooltip>
    );
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 h-8 border-t border-white/20 bg-[#1576b8] text-white backdrop-blur">
        <div className="flex h-full w-full items-center gap-2 px-3 md:px-6">
          <span className={`shrink-0 ${tone}`}>
            {statusIcon(uploadState ? "running" : status)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-xs font-semibold text-white">
                {displayTitle}
              </p>
              <span
                className={`shrink-0 text-[11px] font-medium capitalize ${tone}`}
              >
                {displayStatus}
              </span>
            </div>
          </div>
          {serviceButton(webServer, Globe2)}
          {shield && (
            <StatusTooltip
              label={`Application Shield protection ${shieldPolicy?.enabled === true ? "enabled" : "disabled"}`}
            >
              <button
                type="button"
                aria-label="Open Application Shield configuration"
                className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15"
                onClick={() => onOpenService?.(shield)}
              >
                <ShieldCheck size={13} />
                <span className="hidden xl:inline">Shield</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${shieldPolicy?.enabled === true ? "bg-emerald-300" : "bg-amber-300"}`}
                />
              </button>
            </StatusTooltip>
          )}
          {serviceButton(mysql, Database)}
          {serviceButton(sqlserver, Layers3)}
          {serviceButton(redis, Zap)}
          <StatusTooltip
            label={`Logs ${logHealth.toLowerCase()} · ${formatBytes(logSize)}`}
          >
            <button
              type="button"
              aria-label="Open logs"
              className={`inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15 ${terminalOpen && panel === "logs" ? "bg-white/20" : ""}`}
              onClick={onOpenLogs}
            >
              <FileText size={14} />
              Logs
              {logSummary && (
                <span className={`h-1.5 w-1.5 rounded-full ${logTone}`} />
              )}
            </button>
          </StatusTooltip>
          <StatusTooltip
            label={
              terminalSessions > 0
                ? `${terminalSessions} terminal session${terminalSessions === 1 ? "" : "s"} running`
                : "No terminal session running"
            }
          >
            <button
              type="button"
              aria-label="Open terminal"
              className={`inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15 ${terminalOpen && panel === "terminal" ? "bg-white/20" : ""}`}
              onClick={() => onOpenTerminal?.()}
            >
              <TerminalSquare size={14} />
              Terminal
              <span
                className={`h-1.5 w-1.5 rounded-full ${terminalSessions > 0 ? "bg-emerald-300" : "bg-white/40"}`}
              />
            </button>
          </StatusTooltip>
          <StatusTooltip label="Server information healthy">
            <button
              type="button"
              aria-label="Open server information"
              className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15"
              onClick={onOpenServer}
            >
              <Server size={14} />
              Server
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            </button>
          </StatusTooltip>
        </div>
      </div>
    </>
  );
}
