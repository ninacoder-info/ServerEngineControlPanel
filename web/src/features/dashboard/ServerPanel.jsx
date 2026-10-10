import React from "react";
import { RefreshCw, Server } from "lucide-react";
import { apiRequest } from "../../lib/api";

export default function ServerPanel() {
  const [servers, setServers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest("/api/v1/servers");
      if (!response.ok) return;
      const data = await response.json();
      setServers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const onServerUpdate = () => load();
    window.addEventListener("serverengine:servers-updated", onServerUpdate);
    return () =>
      window.removeEventListener(
        "serverengine:servers-updated",
        onServerUpdate,
      );
  }, [load]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Connected servers
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Manage hosts through the secure agent.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          title="Refresh connected servers"
          aria-label="Refresh connected servers"
          className="inline-flex cursor-pointer items-center justify-center rounded-md border border-neutral-300 p-2 text-neutral-600 hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="mt-7 rounded-xl border border-dashed border-neutral-700 p-8 text-center">
        {loading ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Loading connected servers…
          </p>
        ) : servers.length ? (
          <div className="space-y-3 text-left">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    <Server size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {server.name}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {server.agent_version || server.id}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium ${server.status === "online" ? "text-emerald-600 dark:text-emerald-400" : server.status === "offline" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}
                >
                  {server.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <Server className="mx-auto text-neutral-400" size={28} />
            <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
              No connected servers
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Connect a host agent to manage remote servers here.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
