import React from "react";
import StartupPolicyToggle from "./StartupPolicyToggle";
import {
  Activity,
  FileCode2,
  History,
  Play,
  RotateCw,
  Settings2,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["configuration", "Configuration", Settings2],
  ["logs", "Error log", History],
];

export default function SupervisorConfigModal({
  service,
  installed = [],
  onClose,
}) {
  const item = installed[0] || service || {};
  const [tab, setTab] = React.useState("runtime");
  const [status, setStatus] = React.useState(item.status || "stopped");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const installedState = status !== "not-installed";
  const statusText = installedState
    ? status === "running"
      ? "Running"
      : "Stopped"
    : "Not installed";
  const statusClass =
    status === "running"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "not-installed"
        ? "text-neutral-500 dark:text-neutral-400"
        : "text-amber-600 dark:text-amber-400";

  async function action(nextAction) {
    setBusy(true);
    setMessage("");
    const response = await apiRequest("/api/v1/services/supervisor/action", {
      method: "POST",
      body: JSON.stringify({ action: nextAction }),
    });
    if (!response.ok) {
      setMessage(
        await readApiError(response, `Unable to ${nextAction} Supervisor.`),
      );
      setBusy(false);
      return;
    }
    setStatus(nextAction === "stop" ? "stopped" : "running");
    setMessage(`Supervisor ${nextAction} request submitted.`);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="my-0 w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-neutral-900 sm:my-2">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Process manager
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Supervisor
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              <span className={statusClass}>{statusText}</span> · v
              {item.version || "4.2.5"}
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Manage long-running workers, schedulers, restart policies, and
              process logs.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Supervisor configuration"
            onClick={onClose}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X size={17} />
          </button>
        </header>
        <nav className="flex flex-nowrap gap-5 overflow-x-auto border-b border-neutral-200 px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-5">
          {tab === "configuration" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Supervisor configuration
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Keep the process manager ready for website queues, schedulers,
                  and background workers.
                </p>
              </div>
              <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Configuration file
                  </span>
                  <code className="break-all text-xs text-neutral-500 dark:text-neutral-400">
                    /opt/server-engine/services/supervisor/conf/supervisord.conf
                  </code>
                </div>
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Program directory
                  </span>
                  <code className="break-all text-xs text-neutral-500 dark:text-neutral-400">
                    /opt/server-engine/services/supervisor/conf/programs
                  </code>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Log level
                    <select className="mt-2 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
                      <option>info</option>
                      <option>warn</option>
                      <option>debug</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Log retention
                    <select className="mt-2 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
                      <option>30 days</option>
                      <option>90 days</option>
                      <option>365 days</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Start on boot
                    <select className="mt-2 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
                      <option>Enabled</option>
                      <option>Disabled</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                <ShieldCheck
                  size={17}
                  className="mt-0.5 shrink-0 text-blue-600"
                />
                <span>
                  Programs run with their configured user, working directory,
                  runtime version, and restart policy.
                </span>
              </div>
            </div>
          )}
          {tab === "runtime" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Runtime control
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Start Supervisor before launching managed programs.
                </p>
                <StartupPolicyToggle serviceId="supervisor" />
              </div>
              <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Service state
                  </span>
                  <span className={`text-sm font-semibold ${statusClass}`}>
                    {statusText}
                  </span>
                </div>
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Control socket
                  </span>
                  <code className="break-all text-xs text-neutral-500 dark:text-neutral-400">
                    /opt/server-engine/services/supervisor/run/supervisor.sock
                  </code>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Managed programs
                  </span>
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    0
                  </span>
                </div>
              </div>
              {!installedState ? (
                <p className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                  Install Supervisor from Services before managing its runtime.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {status === "running" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => action("stop")}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        <Square size={15} />
                        Stop
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => action("restart")}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        <RotateCw size={15} />
                        Restart
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => action("start")}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Play size={15} />
                      Start Supervisor
                    </button>
                  )}
                </div>
              )}
              {message && (
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  {message}
                </p>
              )}
            </div>
          )}
          {tab === "logs" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Supervisor error log
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Review process-manager failures and startup diagnostics.
                </p>
              </div>
              <code className="block break-all rounded-md bg-neutral-950 p-4 text-xs leading-6 text-neutral-300">
                /opt/server-engine/services/supervisor/logs/supervisord.log
              </code>
              <pre className="min-h-40 overflow-auto rounded-md bg-neutral-950 p-4 text-xs leading-6 text-neutral-300">
                No Supervisor errors available.
              </pre>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
