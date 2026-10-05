import React from "react";
import { CheckCircle2, CircleAlert, FileText, LoaderCircle, TerminalSquare } from "lucide-react";
import { apiRequest } from "../lib/api";

function statusIcon(status) {
  if (status === "idle") return <span className="block h-2.5 w-2.5 rounded-full bg-neutral-400" />;
  if (status === "succeeded") return <CheckCircle2 size={17} />;
  if (status === "failed" || status === "cancelled") return <CircleAlert size={17} />;
  return <LoaderCircle className="animate-spin" size={17} />;
}

export default function GlobalJobStatusBar({ onOpenTerminal, onOpenLogs, terminalOpen = false, panel = "terminal" }) {
  const [jobs, setJobs] = React.useState([]);
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

  const status = job?.status || "idle";
  const progress = job ? Math.max(0, Math.min(100, Number(job.progress || 0))) : 0;
  const tone = status === "succeeded" ? "text-emerald-600 dark:text-emerald-400" : status === "failed" || status === "cancelled" ? "text-rose-600 dark:text-rose-400" : status === "idle" ? "text-neutral-500 dark:text-neutral-400" : "text-blue-600 dark:text-blue-400";
  const profile = { id: "global-job-terminal", name: "Local Server", kind: "local", username: "root" };

  return <>
    <div className="fixed inset-x-0 bottom-0 z-20 h-8 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
      <div className="flex h-full w-full items-center gap-2 px-3 md:px-6">
        <span className={`shrink-0 ${tone}`}>{statusIcon(status)}</span>
        <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">{job?.type || "Server Engine"}</p><span className={`shrink-0 text-[11px] font-medium capitalize ${tone}`}>{job ? status : "Ready"}</span></div></div>
        <button type="button" title="Open logs" className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded px-2 text-xs ${terminalOpen && panel === "logs" ? "text-blue-600 dark:text-blue-400" : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"}`} onClick={onOpenLogs}><FileText size={14} />Logs</button>
        <button type="button" title="Open terminal" className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded px-2 text-xs ${terminalOpen && panel === "terminal" ? "text-blue-600 dark:text-blue-400" : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"}`} onClick={onOpenTerminal}><TerminalSquare size={14} />Terminal</button>
      </div>
    </div>
  </>;
}
