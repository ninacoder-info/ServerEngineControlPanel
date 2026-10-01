import React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Container,
  ExternalLink,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCw,
  Settings2,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import ActionDialog from "../../components/ActionDialog";
import { TerminalSession } from "../terminal/TerminalPage";
import { FileManagerWorkspace } from "../file-manager/FileManagerPage";
import { apiRequest } from "../../lib/api";

function Section({ title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="space-y-2"><div className="h-3 w-28 rounded bg-slate-100 dark:bg-slate-800" /><div className="h-6 w-64 rounded bg-slate-200 dark:bg-slate-800" /></div>
      </div>
      <div className="h-[32rem] rounded-xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function DockerContainerDetailsPage() {
  const { containerId: routeContainerId = "" } = useParams();
  const location = useLocation();
  const containerId = routeContainerId || decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
  const navigate = useNavigate();
  const [details, setDetails] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const requestedPanel = new URLSearchParams(location.search).get("panel");
  const [panel, setPanel] = React.useState(
    ["logs", "terminal", "config", "files"].includes(requestedPanel)
      ? requestedPanel
      : "logs",
  );
  const [followLogs, setFollowLogs] = React.useState(true);
  const [pendingAction, setPendingAction] = React.useState(null);
  const [dialog, setDialog] = React.useState(null);
  const logRef = React.useRef(null);

  const load = React.useCallback(async () => {
    if (!containerId) return;
    setLoading(true);
    setError("");
    try {
      // Load the inventory row first so the page always has a usable header,
      // even when Docker logs or inspect data are temporarily unavailable.
      const inventoryResponse = await apiRequest("/api/v1/services/docker/overview");
      const inventory = inventoryResponse.ok ? await inventoryResponse.json() : null;
      const summary = (inventory?.containers || []).find(
        (item) => item.id === containerId || String(item.id || "").startsWith(containerId),
      );
      if (summary) setDetails({ ...summary, logs: "" });

      const response = await apiRequest(`/api/v1/services/docker/containers/${encodeURIComponent(containerId)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `Request failed (${response.status})`);
      }
      setDetails(await response.json());
    } catch (reason) {
      setError(reason?.message || "Unable to connect to the Server Engine API.");
    } finally {
      setLoading(false);
    }
  }, [containerId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!pendingAction) return undefined;
    const update = (event) => {
      const detail = event.detail || {};
      if (detail.job?.id !== pendingAction.jobId || !["succeeded", "failed", "cancelled"].includes(detail.status)) return;
      const { action } = pendingAction;
      setPendingAction(null);
      if (action === "delete" && detail.status === "succeeded") navigate("/docker");
      else load();
    };
    window.addEventListener("serverengine:service-status", update);
    return () => window.removeEventListener("serverengine:service-status", update);
  }, [load, navigate, pendingAction]);

  React.useEffect(() => {
    if (panel === "logs" && followLogs && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [details?.logs, followLogs, panel]);

  const runAction = async (action) => {
    setDialog(null);
    try {
      const response = await apiRequest(`/api/v1/services/docker/containers/${encodeURIComponent(containerId)}/action`, { method: "POST", body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error("Unable to queue the Docker action.");
      const result = await response.json();
      setPendingAction({ jobId: result.job_id, action });
    } catch (reason) {
      setError(reason?.message || "Unable to queue the Docker action.");
    }
  };

  if (loading && !details) return <Skeleton />;

  const name = details?.name || containerId;
  const running = details?.status === "running";
  const disabled = Boolean(pendingAction);
  const tabs = [["logs", "Logs", FileCode2], ["terminal", "Terminal", TerminalSquare], ["config", "Configuration", Settings2], ["files", "Files", FolderOpen]];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" aria-label="Back to Docker" title="Back to Docker" className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => navigate("/docker")}><ArrowLeft size={18} /></button>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"><Container size={22} /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Docker container</p>
            <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100">{name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-mono text-slate-500 dark:text-slate-400">{details?.id || containerId}</span>
              <Link to={`/docker/images/${encodeURIComponent(details?.image || "")}`} className="font-mono font-semibold text-blue-600 hover:underline dark:text-blue-400">{details?.image || "Loading image…"}</Link>
              {Object.entries(details?.ports || {}).flatMap(([containerPort, bindings]) => (Array.isArray(bindings) ? bindings : bindings ? [bindings] : []).map((binding) => { const host = binding.HostIp || "127.0.0.1"; const url = `http://${host}:${binding.HostPort}/`; return <a key={`${containerPort}-${binding.HostPort}`} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono font-semibold text-blue-600 hover:underline dark:text-blue-400"><ExternalLink size={13} />{url}</a>; }))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {tabs.map(([key, label, Icon]) => <button key={key} type="button" title={label} aria-label={label} className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border ${panel === key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => setPanel(key)}><Icon size={16} /></button>)}
          <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" />
          <button type="button" title={running ? "Stop container" : "Start container"} aria-label={running ? "Stop container" : "Start container"} disabled={disabled} className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border disabled:cursor-wait disabled:opacity-60 ${running ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`} onClick={() => runAction(running ? "stop" : "start")}>{disabled ? <LoaderCircle className="animate-spin" size={16} /> : running ? <Square size={16} /> : <Play size={16} />}</button>
          <button type="button" title="Restart container" aria-label="Restart container" disabled={disabled} className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => runAction("restart")}><RotateCw size={16} /></button>
          <button type="button" title="Delete container" aria-label="Delete container" disabled={disabled} className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 dark:border-red-900/70 dark:text-red-400" onClick={() => setDialog({ kind: "confirm", title: "Delete container?", message: `This will remove ${name} from Docker. Mounted files and volumes will remain.`, submitLabel: "Delete container", tone: "danger" })}><Trash2 size={16} /></button>
          <button type="button" title="Refresh" aria-label="Refresh" className="ml-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={load}><RefreshCw size={16} /></button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}<button type="button" className="ml-3 cursor-pointer font-semibold underline" onClick={load}>Retry</button></div>}

      {panel === "files" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Writable layer", formatBytes(details?.size_rw)],
              ["Container size", formatBytes(details?.size_rootfs)],
              ["Mounted volumes", String((details?.mounts || []).length)],
              ["Working directory", details?.working_dir || "/"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-2 truncate text-lg font-semibold text-slate-900 dark:text-slate-100" title={value}>{value}</p>
              </div>
            ))}
          </div>
          <FileManagerWorkspace embedded containerId={containerId} initialPath={details?.working_dir || "/"} />
        </div>
      ) : (
      <Section title={panel === "logs" ? "Console logs" : panel === "terminal" ? "Terminal" : "Container configuration"} description={panel === "logs" ? "Recent output from this Docker container." : panel === "terminal" ? "Interactive root shell inside this Docker container." : "Docker configuration for this container."}>
        {panel === "logs" && <pre ref={logRef} onScroll={(event) => { const output = event.currentTarget; setFollowLogs(output.scrollHeight - output.scrollTop - output.clientHeight < 24); }} className="docker-console-output h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-5 font-mono text-xs leading-5 text-slate-200">{details?.logs || "No logs available."}</pre>}
        {panel === "terminal" && <TerminalSession profile={{ id: `docker-${containerId}`, name, kind: "docker", container_id: containerId, username: "root" }} visible enabled restart={0} onStatus={() => {}} onControls={() => {}} />}
        {panel === "config" && <pre className="docker-console-output h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-5 font-mono text-xs leading-5 text-slate-200">{details?.compose_yaml || "No Compose configuration is available for this container."}</pre>}
      </Section>
      )}
      <ActionDialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={() => runAction("delete")} />
    </div>
  );
}
