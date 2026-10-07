import React from "react";
import { CheckCircle2, CircleAlert, Database, FileText, Globe2, Layers3, LoaderCircle, TerminalSquare, Zap } from "lucide-react";
import { apiRequest } from "../lib/api";

function statusIcon(status) {
  if (status === "idle") return <span className="block h-2.5 w-2.5 rounded-full bg-white/70" />;
  if (status === "succeeded") return <CheckCircle2 size={17} />;
  if (status === "failed" || status === "cancelled") return <CircleAlert size={17} />;
  return <LoaderCircle className="animate-spin" size={17} />;
}

export default function GlobalJobStatusBar({ onOpenTerminal, onOpenLogs, onOpenService, terminalOpen = false, panel = "terminal" }) {
  const [jobs, setJobs] = React.useState([]);
  const [services, setServices] = React.useState([]);
  const activeJob = jobs.find((job) => job.status === "running" || job.status === "queued");
  const job = activeJob || jobs[0];

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
      setJobs((current) => [update, ...current.filter((item) => item.id !== update.id)]);
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
    apiRequest("/api/v1/services/installed")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => alive && Array.isArray(items) && setServices(items))
      .catch(() => {});
    const onServiceStatus = (event) => {
      const detail = event.detail || {};
      if (!detail.serviceId || !["start", "stop", "restart"].includes(detail.action)) return;
      if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;
      setServices((current) => current.map((item) => {
        if (item.id !== detail.serviceId && !item.id.startsWith(`${detail.serviceId}@`)) return item;
        if (detail.status !== "succeeded") return item;
        const running = detail.action !== "stop";
        return { ...item, status: running ? "running" : "stopped", running };
      }));
    };
    window.addEventListener("serverengine:service-status", onServiceStatus);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:service-status", onServiceStatus);
    };
  }, []);

  const status = job?.status || "idle";
  const progress = job ? Math.max(0, Math.min(100, Number(job.progress || 0))) : 0;
  const tone = "text-white";
  const profile = { id: "global-job-terminal", name: "Local Server", kind: "local", username: "root" };
  const webServer = ["nginx", "apache", "openlitespeed", "caddy", "haproxy"]
    .map((id) => services.find((item) => item.id === id || item.id.startsWith(`${id}@`)))
    .find(Boolean);
  const mysql = services.find((item) => item.id === "mysql" || item.id === "mariadb");
  const sqlserver = services.find((item) => item.id === "sqlserver");
  const redis = services.find((item) => item.id === "redis" || item.id === "valkey");
  const serviceButton = (item, Icon) => {
    if (!item) return null;
    const running = item.status === "running" || item.running === true;
    return <button type="button" title={`Open ${item.name || item.id} configuration`} className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15" onClick={() => onOpenService?.(item)}><Icon size={13} /><span className="hidden xl:inline">{item.name || item.id}</span><span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-300" : "bg-amber-300"}`} title={running ? "Running" : "Stopped"} /></button>;
  };

  return <>
    <div className="fixed inset-x-0 bottom-0 z-20 h-8 border-t border-white/20 bg-[#1576b8] text-white backdrop-blur">
      <div className="flex h-full w-full items-center gap-2 px-3 md:px-6">
        <span className={`shrink-0 ${tone}`}>{statusIcon(status)}</span>
        <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-xs font-semibold text-white">{job?.type || "Server Engine"}</p><span className={`shrink-0 text-[11px] font-medium capitalize ${tone}`}>{job ? status : "Ready"}</span></div></div>
        {serviceButton(webServer, Globe2)}
        {serviceButton(mysql, Database)}
        {serviceButton(sqlserver, Layers3)}
        {serviceButton(redis, Zap)}
        <button type="button" title="Open logs" className={`inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15 ${terminalOpen && panel === "logs" ? "bg-white/20" : ""}`} onClick={onOpenLogs}><FileText size={14} />Logs</button>
        <button type="button" title="Open terminal" className={`inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15 ${terminalOpen && panel === "terminal" ? "bg-white/20" : ""}`} onClick={onOpenTerminal}><TerminalSquare size={14} />Terminal</button>
      </div>
    </div>
  </>;
}
