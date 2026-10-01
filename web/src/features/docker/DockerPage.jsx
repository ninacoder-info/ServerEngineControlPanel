import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import ActionDialog from "../../components/ActionDialog";
import { TerminalSession } from "../terminal/TerminalPage";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Container,
  Copy,
  Cpu,
  Database,
  FileCode2,
  FolderOpen,
  Image,
  Layers3,
  LoaderCircle,
  Network,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  RotateCw,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { apiRequest } from "../../lib/api";

const tabs = [
  ["containers", "Containers", Container],
  ["images", "Images", Image],
  ["volumes", "Volumes", Database],
  ["networks", "Networks", Network],
  ["compose", "Compose apps", FileCode2],
];

const initialContainers = [
  {
    id: "a8f1c2d3e4",
    name: "server-engine-mysql",
    image: "mysql:8.4",
    status: "Running",
    ports: "3306 → 3307",
    cpu: "1.8%",
    memory: "284 MB",
    uptime: "3 days",
  },
  {
    id: "c91e4a77b2",
    name: "server-engine-redis",
    image: "redis:8.6",
    status: "Running",
    ports: "6379 → 6379",
    cpu: "0.4%",
    memory: "42 MB",
    uptime: "3 days",
  },
  {
    id: "2d8bc03f11",
    name: "checkout-worker",
    image: "checkout-worker:latest",
    status: "Stopped",
    ports: "—",
    cpu: "—",
    memory: "—",
    uptime: "Exited 2 hours ago",
  },
];

const images = [
  ["mysql", "8.4", "421 MB", "3 days ago", "1 container"],
  ["redis", "8.6", "126 MB", "3 days ago", "1 container"],
  ["checkout-worker", "latest", "218 MB", "Yesterday", "1 container"],
  ["nginx", "1.27-alpine", "48 MB", "Sep 24", "0 containers"],
];

const volumes = [
  ["server-engine_mysql_data", "local", "4.8 GB", "server-engine-mysql"],
  ["server-engine_redis_data", "local", "64 MB", "server-engine-redis"],
  ["checkout_uploads", "local", "812 MB", "checkout-worker"],
];

const input =
  "mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function Section({ title, description, actions, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  tone = "slate",
  valueClassName = "text-2xl",
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-9 w-9 place-items-center rounded-md ${tones[tone]}`}
        >
          <Icon size={18} />
        </span>
        <strong
          className={`${valueClassName} font-semibold text-slate-900 dark:text-slate-100`}
        >
          {value}
        </strong>
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function middleEllipsis(value, maxLength = 56) {
  if (!value || value.length <= maxLength) return value;
  const sideLength = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, sideLength)}…${value.slice(-sideLength)}`;
}

function ContainerModal({ container, onClose, onSave }) {
  const editing = Boolean(container);
  const [form, setForm] = React.useState(
    container || {
      name: "",
      image: "",
      ports: "",
      restart: "Unless stopped",
      command: "",
    },
  );
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Docker workload
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {editing ? "Edit container" : "Create container"}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Define the image, ports, restart behavior, and command.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close container form"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <form
          className="space-y-5 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(form);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Container name
              <input
                required
                className={input}
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="my-app"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Image
              <input
                required
                className={`${input} font-mono`}
                value={form.image}
                onChange={(event) => set("image", event.target.value)}
                placeholder="nginx:1.27-alpine"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Published ports
              <input
                className={input}
                value={form.ports}
                onChange={(event) => set("ports", event.target.value)}
                placeholder="8080:80, 8443:443"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Restart policy
              <select
                className={input}
                value={form.restart}
                onChange={(event) => set("restart", event.target.value)}
              >
                <option>Unless stopped</option>
                <option>Always</option>
                <option>On failure</option>
                <option>Never</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Start command
            <input
              className={`${input} font-mono`}
              value={form.command || ""}
              onChange={(event) => set("command", event.target.value)}
              placeholder="Optional command override"
            />
          </label>
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              className="cursor-pointer rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <CheckCircle2 size={16} />
              {editing ? "Save container" : "Create container"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ContainerInspectModal({
  container,
  onClose,
  onAction,
  pendingAction,
}) {
  const [details, setDetails] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [panel, setPanel] = React.useState("logs");
  const [dialog, setDialog] = React.useState(null);
  const logRef = React.useRef(null);
  const [followLogs, setFollowLogs] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiRequest(
        `/api/v1/services/docker/containers/${encodeURIComponent(container.id)}`,
      );
      if (!response.ok) {
        setLoadError(`Unable to load Docker container details (${response.status}).`);
        return;
      }
      setDetails(await response.json());
    } catch {
      setLoadError("Unable to connect to the Server Engine API.");
    } finally {
      setLoading(false);
    }
  }, [container.id]);
  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    if (!pendingAction) return undefined;
    const update = (event) => {
      const detail = event.detail || {};
      if (detail.job?.id !== pendingAction.jobId) return;
      if (["succeeded", "failed", "cancelled"].includes(detail.status)) {
        load();
      }
    };
    window.addEventListener("serverengine:service-status", update);
    return () =>
      window.removeEventListener("serverengine:service-status", update);
  }, [load, pendingAction]);
  React.useEffect(() => {
    if (panel !== "logs" || !details?.logs || !followLogs) return;
    const output = logRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [details?.logs, followLogs, panel]);
  const name = details?.name || container.name;
  const status = details?.status || container.status;
  const detailsReady = Boolean(details);
  const normalizedStatus = String(status).toLowerCase();
  const running =
    normalizedStatus === "running" || normalizedStatus.startsWith("up");
  const path = container.path || "No host path mounted";
  const runAction = async (action) => {
    setDialog(null);
    await onAction?.(container, action);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Back to containers"
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            onClick={onClose}
          >
            <ArrowLeft size={18} />
          </button>
          {detailsReady ? (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
              <Container size={22} />
            </span>
          ) : (
            <span className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          )}
          <div className="min-w-0">
            {detailsReady ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  Docker container
                </p>
                <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {name}
                </h2>
                <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                  {path}
                </p>
              </>
            ) : (
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-28 rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-6 w-56 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-72 max-w-full rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {detailsReady ? (
            <div className="flex items-center gap-1.5">
              {[
                ["logs", "View logs", FileCode2],
                ["terminal", "Open terminal", TerminalSquare],
                ["config", "View configuration", Settings2],
                ["files", "View files", FolderOpen],
              ].map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  aria-label={label}
                  className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border ${panel === key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                  onClick={() => setPanel(key)}
                >
                  <Icon size={16} />
                </button>
              ))}
              <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" />
              <button
                type="button"
                title={running ? "Stop container" : "Start container"}
                aria-label={running ? "Stop container" : "Start container"}
                className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border ${running ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/30" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/70 dark:text-emerald-400 dark:hover:bg-emerald-950/30"}`}
                onClick={() => runAction(running ? "stop" : "start")}
              >
                {running ? <Square size={16} /> : <Play size={16} />}
              </button>
              <button
                type="button"
                title="Restart container"
                aria-label="Restart container"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => runAction("restart")}
              >
                <RotateCw size={16} />
              </button>
              <button
                type="button"
                title="Delete container"
                aria-label="Delete container"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() =>
                  setDialog({
                    kind: "confirm",
                    title: "Delete container?",
                    message: `This will remove ${name} from Docker. Its mounted host files and volumes will not be deleted.`,
                    submitLabel: "Delete container",
                    tone: "danger",
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <div className="flex animate-pulse items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <span
                  key={item}
                  className="h-9 w-9 rounded-md bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          )}
          <button
            type="button"
            title="Refresh container details"
            aria-label="Refresh container details"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            onClick={load}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      {loadError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          {loadError}
          <button
            type="button"
            className="ml-3 cursor-pointer font-semibold underline"
            onClick={load}
          >
            Retry
          </button>
        </div>
      )}
      <Section
        title={
          panel === "logs"
            ? "Console logs"
            : panel === "terminal"
              ? "Terminal"
              : panel === "config"
                ? "Container configuration"
                : "Mounted files"
        }
        description={
          panel === "logs"
            ? "Recent output from this Docker container."
            : panel === "terminal"
              ? "Interactive root shell inside this Docker container."
              : panel === "config"
                ? "Docker configuration for this container."
                : "Host paths mounted into this container."
        }
      >
        {loading ? (
          <div className="h-[32rem] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : details && panel === "logs" ? (
          <pre
            ref={logRef}
            onScroll={(event) => {
              const output = event.currentTarget;
              const atBottom =
                output.scrollHeight - output.scrollTop - output.clientHeight <
                24;
              setFollowLogs(atBottom);
            }}
            className="docker-console-output h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-5 font-mono text-xs leading-5 text-slate-200"
          >
            {details.logs || "No logs available."}
          </pre>
        ) : details && panel === "terminal" ? (
          <TerminalSession
            profile={{
              id: `docker-${container.id}`,
              name,
              kind: "docker",
              container_id: container.id,
              username: "root",
            }}
            visible
            enabled
            restart={0}
            onStatus={() => {}}
            onControls={() => {}}
          />
        ) : details && panel === "config" ? (
          <pre className="docker-console-output h-[32rem] overflow-auto rounded-lg bg-slate-950 p-5 font-mono text-xs leading-5 text-slate-200">
            {JSON.stringify(
              {
                name: details.name,
                image: details.image,
                status: details.status,
                restart_policy: details.restart_policy,
                ports: details.ports,
              },
              null,
              2,
            )}
          </pre>
        ) : details ? (
          <div className="space-y-3">
            {(details.mounts || []).length ? (
              details.mounts.map((mount) => (
                <div
                  key={`${mount.source}-${mount.destination}`}
                  className="flex flex-col gap-1 rounded-md border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"
                >
                  <code className="text-xs text-slate-700 dark:text-slate-300">
                    {mount.source || "Docker volume"}
                  </code>
                  <code className="text-xs text-slate-500 dark:text-slate-400">
                    → {mount.destination}
                  </code>
                </div>
              ))
            ) : (
              <p className="py-12 text-center text-sm text-slate-500">
                No mounted files or folders.
              </p>
            )}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-slate-500">
            Unable to load container logs.
          </p>
        )}
      </Section>
      <ActionDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSubmit={() => runAction("delete")}
      />
    </div>
  );
}

function ContainersTab({
  containers,
  onCreate,
  onAction,
  pendingAction,
  searchValue,
  onSearch,
}) {
  const [menuId, setMenuId] = React.useState(null);
  React.useEffect(() => {
    const close = (event) => {
      if (!event.target.closest("[data-docker-menu]")) setMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const menuAction = async (item, action) => {
    setMenuId(null);
    if (action === "copy") {
      await navigator.clipboard?.writeText(`docker run ${item.image}`);
      return;
    }
    if (action === "terminal") {
      window.location.assign(
        `/docker/containers/${encodeURIComponent(item.id)}?panel=terminal`,
      );
      return;
    }
    if (action === "files") {
      window.location.assign(
        `/docker/containers/${encodeURIComponent(item.id)}?panel=files`,
      );
      return;
    }
    if (["pause", "restart"].includes(action)) await onAction(item, action);
  };
  return (
    <Section
      title="Containers"
      description="Run, inspect, restart, and troubleshoot Docker workloads."
      actions={
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-slate-400 dark:border-slate-700">
            <Search size={15} />
            <input
              className="w-40 bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100"
              value={searchValue}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search containers"
            />
          </label>
          <button
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={onCreate}
          >
            <Plus size={15} />
            Create container
          </button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-3 py-3">Container</th>
              <th className="px-3 py-3">Image</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Ports</th>
              <th className="px-3 py-3">Container ID</th>
              <th className="w-32 min-w-32 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {containers.map((item) => (
              <tr
                key={item.id}
                className="border-b border-slate-100 dark:border-slate-800"
              >
                <td className="px-3 py-4">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.name}
                  </p>
                  <p
                    className="mt-1 max-w-[24rem] truncate font-mono text-xs text-slate-500 dark:text-slate-400"
                    title={item.path || "No host path mounted"}
                  >
                    {middleEllipsis(item.path || "No host path mounted")}
                  </p>
                </td>
                <td className="px-3 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                  {item.image}
                </td>
                <td className="px-3 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${item.status === "Running" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${item.status === "Running" ? "bg-emerald-500" : "bg-slate-400"}`}
                    />
                    {item.status}
                  </span>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {item.status_detail || "—"}
                  </p>
                </td>
                <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                  {item.ports}
                </td>
                <td className="px-3 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                  {item.id || "—"}
                </td>
                <td className="w-32 min-w-32 px-3 py-4 text-right">
                  <div className="flex h-8 items-center justify-end gap-3">
                    <Link
                      to={`/docker/containers/${encodeURIComponent(item.id)}`}
                      className="w-12 cursor-pointer text-right text-sm font-semibold text-blue-600 dark:text-blue-400"
                    >
                      Inspect
                    </Link>
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        title={
                          item.status === "Running"
                            ? "Stop container"
                            : "Start container"
                        }
                        aria-label={`${item.status === "Running" ? "Stop" : "Start"} ${item.name}`}
                        className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full ${item.status === "Running" ? "text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30" : "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"}`}
                        disabled={pendingAction?.containerId === item.id}
                        onClick={() =>
                          onAction(
                            item,
                            item.status === "Running" ? "stop" : "start",
                          )
                        }
                      >
                        {pendingAction?.containerId === item.id ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : item.status === "Running" ? (
                          <Square size={15} />
                        ) : (
                          <Play size={15} />
                        )}
                      </button>
                      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-white dark:text-slate-900">
                        {item.status === "Running"
                          ? "Stop container"
                          : "Start container"}
                      </span>
                    </span>
                    <div className="relative" data-docker-menu>
                      <button
                        type="button"
                        aria-label={`More actions for ${item.name}`}
                        aria-expanded={menuId === item.id}
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        onClick={() =>
                          setMenuId(menuId === item.id ? null : item.id)
                        }
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {menuId === item.id && (
                        <div className="absolute right-0 top-9 z-50 w-60 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
                          {[
                            ["details", "View details", Settings2],
                            ["copy", "Copy docker run", Copy],
                            ["terminal", "Open in terminal", TerminalSquare],
                            ["files", "View files", FolderOpen],
                            ["pause", "Pause", Pause],
                            ["restart", "Restart", RotateCw],
                          ].map(([action, label, Icon]) =>
                            action === "details" ? (
                              <Link
                                key={action}
                                to={`/docker/containers/${encodeURIComponent(item.id)}`}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Icon size={15} />
                                {label}
                              </Link>
                            ) : (
                              <button
                                key={action}
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                onClick={() => menuAction(item, action)}
                              >
                                <Icon size={15} />
                                {label}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!containers.length && (
        <p className="py-10 text-center text-sm text-slate-500">
          No containers found.
        </p>
      )}
    </Section>
  );
}

function ResourcesTab({
  title,
  description,
  rows,
  headers,
  icon: Icon,
  action,
  getRowHref,
  onInspect,
  onClone,
  onDelete,
}) {
  return (
    <Section
      title={title}
      description={description}
      actions={
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {action || "Refresh"}
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {headers.map((header) => (
                <th key={header} className="px-3 py-3">
                  {header}
                </th>
              ))}
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row[0]}
                className="border-b border-slate-100 dark:border-slate-800"
              >
                <td className="px-3 py-4">
                  <div className="flex items-center gap-2">
                    <Icon size={15} className="text-slate-400" />
                    {getRowHref ? (
                      <Link
                        to={getRowHref(row)}
                        className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {row[0]}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {row[0]}
                      </span>
                    )}
                  </div>
                </td>
                {row.slice(1).map((value, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400"
                  >
                    {value}
                  </td>
                ))}
                <td className="px-3 py-4 text-right">
                  {getRowHref ? (
                    <Link
                      to={getRowHref(row)}
                      className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400"
                    >
                      Inspect
                    </Link>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      {onInspect && <button type="button" title="Inspect" aria-label={`Inspect ${row[0]}`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30" onClick={() => onInspect(row)}><Settings2 size={15} /></button>}
                      {onClone && <button type="button" title="Clone volume" aria-label={`Clone ${row[0]}`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => onClone(row)}><Copy size={15} /></button>}
                      {onDelete && <button type="button" title="Delete volume" aria-label={`Delete ${row[0]}`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => onDelete(row)}><Trash2 size={15} /></button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="border-t border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          No {title.toLowerCase()} found.
        </div>
      )}
    </Section>
  );
}

function DockerResourceInspectModal({ resource, onClose }) {
  const [details, setDetails] = React.useState(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let active = true;
    const endpoint = `/api/v1/services/docker/${resource.kind}s/${encodeURIComponent(resource.name)}`;
    apiRequest(endpoint)
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to inspect this Docker resource.");
        const value = await response.json();
        if (active) setDetails(value);
      })
      .catch((reason) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [resource]);
  const isVolume = resource.kind === "volume";
  const facts = isVolume
    ? [
        ["Driver", details?.driver],
        ["Scope", details?.scope],
        ["Created", details?.created],
        ["Size", details ? formatBytes(details.size) : "—"],
        ["Mountpoint", details?.mountpoint],
        ["Labels", Object.keys(details?.labels || {}).length],
      ]
    : [
        ["Driver", details?.driver],
        ["Scope", details?.scope],
        ["Internal", details ? (details.internal ? "Yes" : "No") : "—"],
        ["Attachable", details ? (details.attachable ? "Yes" : "No") : "—"],
        ["Containers", Object.keys(details?.containers || {}).length],
      ];
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Docker {isVolume ? "volume" : "network"}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-slate-900 dark:text-slate-100">
              {resource.name}
            </h2>
          </div>
          <button type="button" aria-label="Close inspection" title="Close" className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="space-y-5 p-5">
          {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
          {!details && !error ? <div className="flex h-32 items-center justify-center text-slate-400"><LoaderCircle className="animate-spin" /></div> : details && <>
            <div className="grid gap-3 sm:grid-cols-3">
              {facts.map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{value ?? "—"}</p></div>)}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Docker inspect</h3>
              <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-4 font-mono text-xs leading-5 text-slate-800 dark:bg-slate-950 dark:text-slate-200">{JSON.stringify(details.inspect, null, 2)}</pre>
            </div>
          </>}
        </div>
      </section>
    </div>
  );
}

function DockerVolumeCloneModal({ volume, onClose, onSubmit }) {
  const [name, setName] = React.useState(`${volume.name}-copy`);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Docker volume</p><h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Clone volume</h2></div><button type="button" title="Close" aria-label="Close clone volume" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}><X size={17} /></button></div>
        <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); onSubmit(name); }}><p className="text-sm text-slate-500 dark:text-slate-400">Copy all files from <strong className="text-slate-700 dark:text-slate-200">{volume.name}</strong> into a new Docker volume.</p><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">New volume name<input autoFocus required pattern="[A-Za-z0-9][A-Za-z0-9_.-]{0,127}" value={name} onChange={(event) => setName(event.target.value)} className={input} /></label><div className="flex justify-end gap-2"><button type="button" className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={onClose}>Cancel</button><button type="submit" className="cursor-pointer rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Clone volume</button></div></form>
      </section>
    </div>
  );
}

const composeTemplates = {
  "PHP + MySQL": `services:
  web:
    image: php:8.3-apache
    ports:
      - "8080:80"
    volumes:
      - ./app:/var/www/html
    depends_on:
      - database

  database:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: change-me
      MYSQL_DATABASE: app
    volumes:
      - database_data:/var/lib/mysql

volumes:
  database_data:`,
  "Node.js + Redis": `services:
  app:
    image: node:22-bookworm
    working_dir: /app
    command: npm run dev
    ports:
      - "3000:3000"
    volumes:
      - ./app:/app
      - /app/node_modules
    depends_on:
      - redis

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  redis_data:`,
  "Nginx static site": `services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
    volumes:
      - ./public:/usr/share/nginx/html:ro`,
  "Laravel + MySQL + Redis": `services:
  app:
    image: php:8.3-fpm
    working_dir: /var/www/html
    volumes:
      - ./app:/var/www/html
    depends_on:
      - database
      - redis

  web:
    image: nginx:latest
    ports:
      - "8080:80"
    volumes:
      - ./app:/var/www/html:ro
      - ./docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - app

  database:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: change-me
      MYSQL_DATABASE: laravel
      MYSQL_USER: laravel
      MYSQL_PASSWORD: change-me
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  mysql_data:
  redis_data:`,
  "WordPress + MySQL": `services:
  wordpress:
    image: wordpress:latest
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: database:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: change-me
    volumes:
      - wordpress_data:/var/www/html
    depends_on:
      - database

  database:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: change-me
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: change-me
    volumes:
      - database_data:/var/lib/mysql

volumes:
  wordpress_data:
  database_data:`,
  "Node.js + PostgreSQL": `services:
  app:
    image: node:22-bookworm
    working_dir: /app
    command: npm run dev
    ports:
      - "3000:3000"
    volumes:
      - ./app:/app
      - node_modules:/app/node_modules
    environment:
      DATABASE_URL: postgres://app:change-me@database:5432/app
    depends_on:
      - database

  database:
    image: postgres:17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  node_modules:
  postgres_data:`,
  "FastAPI + PostgreSQL": `services:
  api:
    image: python:3.12-slim
    working_dir: /app
    command: sh -c "pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
    ports:
      - "8000:8000"
    volumes:
      - ./app:/app
    environment:
      DATABASE_URL: postgresql://app:change-me@database:5432/app
    depends_on:
      - database

  database:
    image: postgres:17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:`,
  "Next.js + PostgreSQL": `services:
  web:
    image: node:22-bookworm
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    ports:
      - "3000:3000"
    volumes:
      - ./app:/app
      - next_node_modules:/app/node_modules
      - next_build:/app/.next
    environment:
      DATABASE_URL: postgresql://app:change-me@database:5432/app
    depends_on:
      - database

  database:
    image: postgres:17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  next_node_modules:
  next_build:
  postgres_data:`,
  "Node.js + MongoDB": `services:
  app:
    image: node:22-bookworm
    working_dir: /app
    command: npm run dev
    ports:
      - "3000:3000"
    volumes:
      - ./app:/app
      - node_modules:/app/node_modules
    environment:
      MONGODB_URI: mongodb://database:27017/app
    depends_on:
      - database

  database:
    image: mongo:8
    volumes:
      - mongo_data:/data/db

volumes:
  node_modules:
  mongo_data:`,
  "RabbitMQ worker": `services:
  worker:
    image: node:22-bookworm
    working_dir: /app
    command: npm run worker
    volumes:
      - ./app:/app
      - worker_node_modules:/app/node_modules
    environment:
      AMQP_URL: amqp://rabbitmq:5672
    depends_on:
      - rabbitmq

  rabbitmq:
    image: rabbitmq:4-management
    ports:
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  worker_node_modules:
  rabbitmq_data:`,
  "Redis + Adminer": `services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  adminer:
    image: adminer:latest
    ports:
      - "8080:8080"

volumes:
  redis_data:`,
  "PostgreSQL + Adminer": `services:
  database:
    image: postgres:17
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

  adminer:
    image: adminer:latest
    ports:
      - "8080:8080"

volumes:
  postgres_data:`,
  "MySQL + phpMyAdmin": `services:
  database:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: change-me
      MYSQL_DATABASE: app
      MYSQL_USER: app
      MYSQL_PASSWORD: change-me
    volumes:
      - mysql_data:/var/lib/mysql

  phpmyadmin:
    image: phpmyadmin:latest
    ports:
      - "8080:80"
    environment:
      PMA_HOST: database
      MYSQL_ROOT_PASSWORD: change-me
    depends_on:
      - database

volumes:
  mysql_data:`,
  "MariaDB + Adminer": `services:
  database:
    image: mariadb:11
    environment:
      MARIADB_ROOT_PASSWORD: change-me
      MARIADB_DATABASE: app
      MARIADB_USER: app
      MARIADB_PASSWORD: change-me
    volumes:
      - mariadb_data:/var/lib/mysql

  adminer:
    image: adminer:latest
    ports:
      - "8080:8080"
    depends_on:
      - database

volumes:
  mariadb_data:`,
  "Django + PostgreSQL": `services:
  web:
    image: python:3.12-slim
    working_dir: /app
    command: sh -c "pip install -r requirements.txt && python manage.py migrate && python manage.py runserver 0.0.0.0:8000"
    ports:
      - "8000:8000"
    volumes:
      - ./app:/app
    environment:
      DATABASE_URL: postgres://app:change-me@database:5432/app
    depends_on:
      - database

  database:
    image: postgres:17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:`,
  "Ruby on Rails + PostgreSQL": `services:
  web:
    image: ruby:3.4
    working_dir: /app
    command: bash -c "bundle install && bin/rails db:prepare && bin/rails server -b 0.0.0.0"
    ports:
      - "3000:3000"
    volumes:
      - ./app:/app
      - bundle_cache:/usr/local/bundle
    environment:
      DATABASE_URL: postgres://app:change-me@database:5432/app
    depends_on:
      - database

  database:
    image: postgres:17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  bundle_cache:
  postgres_data:`,
  "Go API + PostgreSQL": `services:
  api:
    image: golang:1.24
    working_dir: /app
    command: go run ./cmd/server
    ports:
      - "8080:8080"
    volumes:
      - ./app:/app
      - go_cache:/go
    environment:
      DATABASE_URL: postgres://app:change-me@database:5432/app
    depends_on:
      - database

  database:
    image: postgres:17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  go_cache:
  postgres_data:`,
  "Spring Boot + PostgreSQL": `services:
  app:
    image: eclipse-temurin:21-jdk
    working_dir: /app
    command: ./mvnw spring-boot:run
    ports:
      - "8080:8080"
    volumes:
      - ./app:/app
      - maven_cache:/root/.m2
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://database:5432/app
      SPRING_DATASOURCE_USERNAME: app
      SPRING_DATASOURCE_PASSWORD: change-me
    depends_on:
      - database

  database:
    image: postgres:17
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  maven_cache:
  postgres_data:`,
  "MinIO object storage": `services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: change-me-now
    volumes:
      - minio_data:/data

volumes:
  minio_data:`,
  "Mailpit email testing": `services:
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "8025:8025"
      - "1025:1025"`,
  "Grafana dashboard": `services:
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  grafana_data:`,
  "OpenSearch + Dashboards": `services:
  opensearch:
    image: opensearchproject/opensearch:latest
    environment:
      discovery.type: single-node
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: -Xms512m -Xmx512m
    ports:
      - "9200:9200"
    volumes:
      - opensearch_data:/usr/share/opensearch/data

  dashboards:
    image: opensearchproject/opensearch-dashboards:latest
    ports:
      - "5601:5601"
    environment:
      OPENSEARCH_HOSTS: '["http://opensearch:9200"]'
      DISABLE_SECURITY_DASHBOARDS_PLUGIN: "true"
    depends_on:
      - opensearch

volumes:
  opensearch_data:`,
  "Caddy reverse proxy": `services:
  caddy:
    image: caddy:latest
    command: caddy reverse-proxy --from :80 --to app:3000
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - caddy_data:/data
      - caddy_config:/config

  app:
    image: traefik/whoami:latest
    expose:
      - "80"

volumes:
  caddy_data:
  caddy_config:`,
  "HAProxy load balancer": `services:
  haproxy:
    image: haproxy:latest
    command: sh -c 'printf "global\\n  daemon\\n  maxconn 256\\n\\ndefaults\\n  mode http\\n  timeout connect 5s\\n  timeout client 30s\\n  timeout server 30s\\n\\nfrontend http\\n  bind :80\\n  default_backend app\\n\\nbackend app\\n  server app1 app:80 check\\n" > /tmp/haproxy.cfg && haproxy -f /tmp/haproxy.cfg -db'
    ports:
      - "8080:80"

  app:
    image: nginx:latest`,
};

function ComposeStarterModal({ onClose, onCreate }) {
  const [template, setTemplate] = React.useState(Object.keys(composeTemplates)[0]);
  const [fileName, setFileName] = React.useState("compose.yml");
  const [projectName, setProjectName] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const content = composeTemplates[template];
  const copy = async () => {
    await navigator.clipboard?.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Docker Compose</p><h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Compose starter</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a starting definition, then save it as compose.yml in your project folder.</p></div><button type="button" title="Close" aria-label="Close Compose starter" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}><X size={17} /></button></div>
        <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); onCreate(projectName, fileName, content); }}><div className="grid gap-4 sm:grid-cols-3"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Project name<input required pattern="[A-Za-z0-9]{1,64}" className={input} value={projectName} onChange={(event) => setProjectName(event.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="myapp" /><span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">Letters and numbers only.</span></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">Starter template<select className={input} value={template} onChange={(event) => setTemplate(event.target.value)}>{Object.keys(composeTemplates).map((name) => <option key={name}>{name}</option>)}</select></label></div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Compose filename<select className={input} value={fileName} onChange={(event) => setFileName(event.target.value)}><option>compose.yml</option><option>compose.yaml</option><option>docker-compose.yml</option><option>docker-compose.yaml</option></select></label><pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-4 font-mono text-xs leading-5 text-slate-800 dark:bg-slate-950 dark:text-slate-200">{content}</pre><div className="rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">Server Engine creates <code className="font-mono">/server-engine/compose/{projectName || "project-name"}/{fileName}</code> and runs <code className="font-mono">docker compose -f {fileName} up -d</code>. The selected starter contains everything needed to start its declared containers.</div><div className="flex items-center justify-between gap-3"><button type="button" className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" onClick={copy}><Copy size={15} />{copied ? "Copied" : `Copy ${fileName}`}</button><div className="flex gap-2"><button type="button" className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={onClose}>Cancel</button><button type="submit" className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Play size={15} />Create and start</button></div></div></form>
      </section>
    </div>
  );
}

function Overview({ containers, docker, children }) {
  if (!docker?.installed) {
    return (
      <Section
        title="Docker Engine is not installed"
        description="Install Docker Engine on the Ubuntu host before managing containers, images, volumes, or networks."
      >
        <div className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <CircleAlert className="text-amber-500" size={20} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Docker is not available to Server Engine.
            </p>
          </div>
          <a
            href="/services#docker"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open Services
          </a>
        </div>
      </Section>
    );
  }
  if (!docker.running) {
    return (
      <Section
        title="Docker Engine is stopped"
        description="Docker is installed, but its daemon is not responding."
      >
        <div className="flex items-center gap-3 rounded-md bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <CircleAlert size={20} />
          {docker.error ||
            "Start Docker Engine on the host, then refresh this page."}
        </div>
      </Section>
    );
  }
  const cpu = Number(docker.cpu_percent) || 0;
  const cpuLimit = Number(docker.cpu_limit_percent) || 100;
  const memoryUsed = Number(docker.memory_used_bytes) || 0;
  const memoryLimit = Number(docker.memory_limit_bytes) || 0;
  const cpuCount = Math.max(1, Math.round(cpuLimit / 100));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Container}
          label="Containers"
          value={containers.length}
          detail={`${containers.filter((item) => item.status === "Running").length} running`}
          tone="blue"
        />
        <Stat
          icon={Image}
          label="Images"
          value={docker.images}
          detail="Docker Engine inventory"
        />
        <Stat
          icon={Cpu}
          label="Container CPU usage"
          value={`${cpu.toFixed(2)}% / ${cpuLimit}% (${cpuCount} CPUs)`}
          valueClassName="whitespace-nowrap text-lg"
          detail="Aggregate usage across running containers"
          tone="emerald"
        />
        <Stat
          icon={Database}
          label="Container memory usage"
          value={`${formatBytes(memoryUsed)} / ${formatBytes(memoryLimit)}`}
          valueClassName="whitespace-nowrap text-lg"
          detail="Aggregate usage across containers"
          tone="emerald"
        />
      </div>
      {children}
    </div>
  );
}

export default function DockerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab = tabs.some(([id]) => id === requestedTab)
    ? requestedTab
    : "containers";
  const [tab, setTabState] = React.useState(initialTab);
  const [docker, setDocker] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [containers, setContainers] = React.useState([]);
  const [query, setQuery] = React.useState("");
  const [modal, setModalState] = React.useState(null);
  const [resourceInspect, setResourceInspect] = React.useState(null);
  const [cloneVolume, setCloneVolume] = React.useState(null);
  const [resourceDialog, setResourceDialog] = React.useState(null);
  const [composeStarter, setComposeStarter] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState(null);
  const setModal = (value) => {
    setModalState(value);
  };
  const setTab = (nextTab) => {
    setTabState(nextTab);
    setSearchParams(nextTab === "containers" ? {} : { tab: nextTab }, { replace: true });
  };
  React.useEffect(() => {
    if (tabs.some(([id]) => id === requestedTab)) {
      setTabState(requestedTab);
    } else if (!requestedTab) {
      setTabState("containers");
    }
  }, [requestedTab]);
  const refreshInventory = React.useCallback(async () => {
    try {
      const response = await apiRequest("/api/v1/services/docker/overview");
      const value = response.ok ? await response.json() : null;
      setDocker(value);
      setContainers(value?.containers || []);
    } catch {
      setDocker({ installed: false, running: false, containers: [] });
      setContainers([]);
    }
  }, []);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      await refreshInventory();
    } finally {
      setLoading(false);
    }
  }, [refreshInventory]);
  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    const update = (event) => {
      const detail = event.detail || {};
      if (!pendingAction || detail.job?.id !== pendingAction.jobId) return;
      if (["queued", "running"].includes(detail.status)) return;
      if (["succeeded", "failed", "cancelled"].includes(detail.status)) {
        setPendingAction(null);
        refreshInventory();
      }
    };
    window.addEventListener("serverengine:service-status", update);
    return () =>
      window.removeEventListener("serverengine:service-status", update);
  }, [pendingAction, refreshInventory]);
  const save = async (value) => {
    const response = await apiRequest("/api/v1/services/docker/containers", {
      method: "POST",
      body: JSON.stringify(value),
    });
    if (response.ok) {
      setModal(null);
      await load();
    }
  };
  const action = async (item, actionName) => {
    const response = await apiRequest(
      `/api/v1/services/docker/containers/${encodeURIComponent(item.id)}/action`,
      { method: "POST", body: JSON.stringify({ action: actionName }) },
    );
    if (response.ok) {
      const result = await response.json();
      setPendingAction({
        jobId: result.job_id,
        containerId: item.id,
        action: actionName,
      });
    }
  };
  const filtered = containers.filter((item) =>
    `${item.name} ${item.image} ${item.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const imageRows = (docker?.images_list || []).map((item) => [
    `${item.repository}:${item.tag}`,
    item.size,
    item.created,
    item.id,
  ]);
  const volumeRows = (docker?.volumes_list || []).map((item) => [
    item.name,
    item.driver,
    item.scope,
    item.created || "—",
    formatBytes(item.size),
  ]);
  const networkRows = (docker?.networks_list || []).map((item) => [
    item.name,
    item.driver,
    item.scope,
    item.id,
  ]);
  const composeRows = docker?.compose_list || [];
  const tabSkeleton = (
    <Section title="Loading Docker data…">
      <div
        className="animate-pulse space-y-4"
        aria-label="Loading Docker data"
        aria-busy="true"
      >
        <div className="h-10 w-64 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="h-11 bg-slate-100 dark:bg-slate-800" />
          {[1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="flex gap-4 border-t border-slate-200 px-4 py-5 dark:border-slate-800"
            >
              <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 w-28 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="ml-auto h-4 w-16 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
  const body = {
    containers: (
      <Overview containers={containers} docker={docker}>
        <ContainersTab
          containers={filtered}
          onCreate={() => setModal({})}
          onAction={action}
          pendingAction={pendingAction}
          searchValue={query}
          onSearch={setQuery}
        />
      </Overview>
    ),
    images: (
      <ResourcesTab
        title="Images"
        description="Images currently stored in the Docker Engine."
        headers={["Image", "Size", "Created", "Image ID"]}
        rows={imageRows}
        icon={Image}
        getRowHref={(row) => `/docker/images/${encodeURIComponent(row[0])}`}
      />
    ),
    volumes: (
      <ResourcesTab
        title="Volumes"
        description="Persistent Docker volumes currently managed by Docker."
        headers={["Volume", "Driver", "Scope", "Created", "Size"]}
        rows={volumeRows}
        icon={Database}
        onInspect={(row) => setResourceInspect({ kind: "volume", name: row[0] })}
        onClone={(row) => setCloneVolume({ name: row[0] })}
        onDelete={(row) => setResourceDialog({ kind: "confirm", resourceKind: "volume", name: row[0], title: "Delete Docker volume?", message: `This will permanently delete ${row[0]} and its stored data.`, submitLabel: "Delete volume", tone: "danger" })}
      />
    ),
    networks: (
      <ResourcesTab
        title="Networks"
        description="Networks currently managed by the Docker Engine."
        headers={["Network", "Driver", "Scope", "Network ID"]}
        rows={networkRows}
        icon={Network}
        onInspect={(row) => setResourceInspect({ kind: "network", name: row[0] })}
      />
    ),
    compose: (
      <Section
        title="Compose apps"
        description="Manage multi-container applications from live Docker Compose projects."
        actions={<button type="button" className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => setComposeStarter(true)}><Plus size={15} />Compose starter</button>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-3 py-3">Project</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Configuration</th>
              </tr>
            </thead>
            <tbody>
              {composeRows.map((item) => (
                <tr
                  key={item.name}
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  <td className="px-3 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.name}
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {item.status}
                  </td>
                  <td className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">
                    {item.config}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!composeRows.length && (
          <div className="grid gap-4 border-t border-slate-200 py-8 dark:border-slate-800 md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-5 dark:bg-slate-950"><div className="flex items-start gap-3"><FileCode2 className="mt-0.5 text-blue-600 dark:text-blue-400" size={20} /><div><h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">No Compose apps detected</h4><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">This list only shows projects known to the Docker daemon. Put a compose.yml in a project folder and run it once to make it appear here.</p></div></div></div>
            <div className="rounded-lg border border-dashed border-slate-300 p-5 dark:border-slate-700"><h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Start with a template</h4><p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Generate a clean starter file for PHP, Node.js, Redis, MySQL, or a static Nginx site.</p><button type="button" className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => setComposeStarter(true)}>Choose a starter <ArrowLeft className="rotate-180" size={15} /></button></div>
          </div>
        )}
      </Section>
    ),
  }[tab];
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Services / Containers
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Docker
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Manage containers, images, persistent storage, networks, and Compose
            applications from one workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${docker?.running ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${docker?.running ? "bg-emerald-500" : "bg-slate-400"}`}
            />
            {loading
              ? "Checking Docker…"
              : docker?.running
                ? "Docker Engine available"
                : docker?.installed
                  ? "Docker Engine stopped"
                  : "Docker not installed"}
          </span>
          <button
            type="button"
            title="Refresh Docker data"
            aria-label="Refresh Docker data"
            onClick={load}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading ? tabSkeleton : body}
      {modal && (
        <ContainerModal
          container={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}
      {resourceInspect && (
        <DockerResourceInspectModal
          resource={resourceInspect}
          onClose={() => setResourceInspect(null)}
        />
      )}
      {cloneVolume && <DockerVolumeCloneModal volume={cloneVolume} onClose={() => setCloneVolume(null)} onSubmit={async (name) => { const response = await apiRequest(`/api/v1/services/docker/volumes/${encodeURIComponent(cloneVolume.name)}/action`, { method: "POST", body: JSON.stringify({ action: "clone", clone_name: name }) }); if (response.ok) { setCloneVolume(null); await load(); } }} />}
      <ActionDialog dialog={resourceDialog} onClose={() => setResourceDialog(null)} onSubmit={async () => { if (!resourceDialog) return; const response = await apiRequest(`/api/v1/services/docker/volumes/${encodeURIComponent(resourceDialog.name)}/action`, { method: "POST", body: JSON.stringify({ action: "delete" }) }); if (response.ok) { setResourceDialog(null); await load(); } }} />
      {composeStarter && <ComposeStarterModal onClose={() => setComposeStarter(false)} onCreate={async (projectName, filename, content) => { const response = await apiRequest("/api/v1/services/docker/compose", { method: "POST", body: JSON.stringify({ project_name: projectName, filename, content }) }); if (response.ok) { setComposeStarter(false); setTab("compose"); await load(); } }} />}
    </div>
  );
}
