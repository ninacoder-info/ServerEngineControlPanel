import React from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, X } from "lucide-react";
import Button from "../../components/Button";
import { apiRequest } from "../../lib/api";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

function stagesFor(type = "") {
  const value = type.toLowerCase();
  if (value.includes("wordpress")) {
    return ["Preparing WordPress", "Downloading WordPress release", "Extracting WordPress files", "Creating database", "Configuring WordPress", "Verifying website"];
  }
  if (value.includes("node.js project")) {
    return ["Validating project", "Preparing project files", "Installing dependencies", "Building application", "Configuring process and web server", "Verifying project"];
  }
  if (value.includes("proxy")) {
    return ["Validating proxy", "Writing provider configuration", "Testing configuration", "Reloading web server", "Verifying route"];
  }
  return ["Validating website", "Preparing application files", "Provisioning database", "Writing website configuration", "Reloading web server", "Verifying website"];
}

function stageIndex(job, stages) {
  if (!job) return 0;
  if (job.status === "succeeded") return stages.length;
  const message = String(job.message || "").toLowerCase();
  const hints = stages[0] === "Validating proxy" ? [
    ["valid", 0], ["writ", 1], ["test", 2], ["reload", 3], ["restart", 3], ["verif", 4], ["ready", 4],
  ] : [
    ["valid", 0],
    ["prepar", 1],
    ["download", 1],
    ["extract", 1],
    ["install", 2],
    ["dependenc", 2],
    ["database", 2],
    ["build", 3],
    ["configur", 3],
    ["writ", 3],
    ["reload", 4],
    ["restart", 4],
    ["verif", 5],
    ["ready", 5],
  ];
  const match = hints.find(([hint]) => message.includes(hint));
  if (match) return Math.min(Number(match[1]), stages.length - 1);
  return Math.min(Math.floor(Number(job.progress || 0) / (100 / stages.length)), stages.length - 1);
}

export default function ProjectOperationModal({ jobId, title, kind = "", onClose }) {
  const [job, setJob] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [showOutput, setShowOutput] = React.useState(false);
  const stages = React.useMemo(() => stagesFor(kind || job?.type || title), [job?.type, kind, title]);
  const proxyOperation = kind === "Reverse proxy" || stages[0] === "Validating proxy";

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      const response = await apiRequest("/api/v1/jobs");
      if (!alive || !response.ok) return;
      const jobs = await response.json();
      const found = jobs.find((item) => item.id === jobId);
      if (found) setJob(found);
      setLoading(false);
    };
    load();
    const onJobUpdate = (event) => {
      const update = event.detail?.job;
      if (update?.id === jobId) {
        setJob(update);
        setLoading(false);
      } else if (!update) {
        load();
      }
    };
    window.addEventListener("serverengine:jobs-updated", onJobUpdate);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:jobs-updated", onJobUpdate);
    };
  }, [jobId]);

  const finished = terminalStatuses.has(job?.status);
  const currentStage = stageIndex(job, stages);
  const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
  const log = job?.log || [];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-neutral-900" role="dialog" aria-modal="true" aria-labelledby="project-operation-title">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Operations</p>
            <h2 id="project-operation-title" className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{proxyOperation ? "The proxy route stays here while Server Engine writes and verifies its configuration." : "The project stays open here while Server Engine prepares and verifies it."}</p>
          </div>
          {finished && <button type="button" aria-label="Close" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={onClose}><X size={18} /></button>}
        </div>
        <div className="space-y-6 px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {finished ? (job?.status === "succeeded" ? <CheckCircle2 className="shrink-0 text-emerald-500" size={22} /> : <CircleAlert className="shrink-0 text-rose-500" size={22} />) : <LoaderCircle className="shrink-0 animate-spin text-blue-600" size={22} />}
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{loading ? "Starting operation…" : job?.message || "Working…"}</p><p className="mt-1 text-xs capitalize text-neutral-500 dark:text-neutral-400">{job?.status || "queued"} · {progress}%</p></div>
            </div>
            <span className={`shrink-0 text-sm font-semibold ${job?.status === "succeeded" ? "text-emerald-600 dark:text-emerald-400" : job?.status === "failed" || job?.status === "cancelled" ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}`}>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"><div className={`h-full rounded-full transition-all ${job?.status === "failed" ? "bg-rose-500" : job?.status === "succeeded" ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${progress}%` }} /></div>
          <div className="space-y-2">
            {stages.map((stage, index) => {
              const complete = index < currentStage || job?.status === "succeeded";
              const active = !finished && index === currentStage;
              return <div key={stage} className="flex items-center gap-3 text-sm"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${complete ? "border-emerald-500 bg-emerald-500 text-white" : active ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400" : "border-neutral-300 text-neutral-400 dark:border-neutral-700"}`}>{complete ? <CheckCircle2 size={14} /> : active ? <LoaderCircle className="animate-spin" size={14} /> : <span className="text-xs">{index + 1}</span>}</span><span className={complete || active ? "font-medium text-neutral-900 dark:text-neutral-100" : "text-neutral-400 dark:text-neutral-500"}>{stage}</span></div>;
            })}
          </div>
          <div><button type="button" className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800" onClick={() => setShowOutput((value) => !value)} aria-expanded={showOutput}><span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{showOutput ? "Hide output" : "Show output"} <span className="font-normal text-neutral-500 dark:text-neutral-400">({log.length} {log.length === 1 ? "entry" : "entries"})</span></span><span className="text-xs font-medium text-blue-600 dark:text-blue-400">{showOutput ? "Hide" : "View"}</span></button>{showOutput && <pre className="mt-2 max-h-64 min-h-24 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-100 p-4 font-mono text-xs leading-5 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">{log.length ? log.join("\n") : job?.message || "Waiting for job output…"}</pre>}</div>
        </div>
        <div className="flex justify-end border-t border-neutral-200 px-6 py-4 dark:border-neutral-800"><Button type="button" variant={finished ? "primary" : "secondary"} disabled={!finished} onClick={onClose}>{finished ? "Close" : "Working…"}</Button></div>
      </section>
    </div>
  );
}
