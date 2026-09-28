import React from "react";
import { RefreshCw, X } from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";

export default function InstallServiceModal({
  service,
  initialVersion,
  onClose,
}) {
  const [version, setVersion] = React.useState("");
  const [versions, setVersions] = React.useState([]);
  const [message, setMessage] = React.useState("");
  const [messageTone, setMessageTone] = React.useState("error");
  const [busy, setBusy] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  async function refreshVersions(manual = true) {
    setRefreshing(true);
    if (manual) setMessage("");
    const response = await apiRequest(
      `/api/v1/services/${service.id}/versions/refresh`,
      { method: "POST" },
    );
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (response.ok && body.versions?.length) {
      setVersions(body.versions);
      window.sessionStorage.setItem(
        `server-engine:service-versions:${service.id}`,
        JSON.stringify(body.versions),
      );
      setVersion((current) =>
        body.versions.some((item) => item.version === current)
          ? current
          : body.versions[0].version,
      );
      if (manual) {
        setToast({
          type: "success",
          message: body.message || "Compatible versions refreshed.",
        });
      }
    } else if (manual) {
      setToast({
        type: "error",
        message: body.message || "Unable to refresh compatible versions.",
      });
    }
    setRefreshing(false);
  }

  React.useEffect(() => {
    const cacheKey = `server-engine:service-versions:${service.id}`;
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
      if (Array.isArray(cached) && cached.length) {
        setVersions(cached);
        setVersion((current) =>
          cached.some((item) => item.version === current)
            ? current
            : cached[0].version,
        );
        return;
      }
    } catch {
      window.sessionStorage.removeItem(cacheKey);
    }
    refreshVersions(false);
  }, [service.id]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const response = await apiRequest(
      `/api/v1/services/${service.id}/install`,
      { method: "POST", body: JSON.stringify({ version, confirmed: true }) },
    );
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (response.ok && body.status === "queued") {
      onClose();
      return;
    }
    setMessageTone("error");
    setMessage(body.message || "The installation request could not be queued.");
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-service-title"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              id="install-service-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Install {service.name}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose the release to install on this server.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close installer"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            <span className="flex items-center justify-between gap-3">
              <span>Version</span>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
                onClick={refreshVersions}
                disabled={refreshing || busy}
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Fetching…" : "Fetch compatible versions"}
              </button>
            </span>
            <select
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {versions.map((item) => (
                <option key={item.version} value={item.version}>
                  {item.version} · {item.channel}
                </option>
              ))}
              {!versions.length && (
                <option value="">{refreshing ? "Fetching compatible versions…" : "No compatible versions found"}</option>
              )}
            </select>
          </label>
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            The service will be installed in Server Engine service area. The
            global system package database will not be changed.
          </p>
          {message && (
            <p className={`text-sm ${messageTone === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {message}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !version}
            >
              {busy ? "Installing…" : "Install"}
            </button>
          </div>
        </form>
      </section>
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
