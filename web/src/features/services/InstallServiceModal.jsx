import React from "react";
import { RefreshCw, X } from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";

const latestFirst = (items) =>
  [...items].sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true, sensitivity: "base" }));

export default function InstallServiceModal({
  service,
  initialVersion,
  onClose,
}) {
  const [version, setVersion] = React.useState("");
  const [installMethod, setInstallMethod] = React.useState(
    service.install_methods?.includes("prebuilt") ? "prebuilt" : "source",
  );
  const [versions, setVersions] = React.useState([]);
  const [phpRuntimes, setPhpRuntimes] = React.useState([]);
  const [phpVersion, setPhpVersion] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [messageTone, setMessageTone] = React.useState("error");
  const [busy, setBusy] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const refreshSequence = React.useRef(0);

  function selectPreferredVersion(items) {
    const preferred = items.some((item) => item.version === initialVersion)
      ? initialVersion
      : items[0]?.version || "";
    setVersion(preferred);
  }

  async function refreshVersions(manual = true) {
    const method = installMethod;
    const requestId = refreshSequence.current + 1;
    refreshSequence.current = requestId;
    setRefreshing(true);
    setVersions([]);
    setVersion("");
    if (manual) setMessage("");
    let response;
    let body;
    try {
      response = await apiRequest(
        `/api/v1/services/${service.id}/versions/refresh?install_method=${method}`,
        { method: "POST" },
      );
      body = response.ok
        ? await response.json()
        : { message: await readApiError(response) };
    } catch {
      response = { ok: false };
      body = { message: "Unable to fetch compatible versions." };
    }
    if (requestId !== refreshSequence.current || method !== installMethod) return;
    if (response.ok && body.versions?.length) {
      setVersions(body.versions);
      window.sessionStorage.setItem(
        `server-engine:service-versions:v10:${service.id}:${method}`,
        JSON.stringify(body.versions),
      );
      selectPreferredVersion(body.versions);
      if (manual) {
        setToast({
          type: "success",
          message: body.message || "Compatible versions refreshed.",
        });
      }
    } else {
      setToast({
        type: "error",
        message: body.message || "Unable to refresh compatible versions.",
      });
    }
    setRefreshing(false);
  }

  function changeInstallMethod(method) {
    if (method === installMethod) return;
    setInstallMethod(method);
    setRefreshing(false);
    setVersions([]);
    setVersion("");
    setMessage("");
  }

  React.useEffect(() => {
    const cacheKey = `server-engine:service-versions:v10:${service.id}:${installMethod}`;
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
      if (Array.isArray(cached) && cached.length) {
        setVersions(cached);
        selectPreferredVersion(cached);
        return;
      }
    } catch {
      window.sessionStorage.removeItem(cacheKey);
    }
    refreshVersions(false);
  }, [service.id, installMethod]);

  React.useEffect(() => {
    if (!(["composer", "wp-cli"].includes(service.id))) return undefined;
    apiRequest("/api/v1/services/php/runtimes")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => {
        const ordered = latestFirst(items);
        setPhpRuntimes(ordered);
        setPhpVersion((current) =>
          ordered.some((item) => item.version === current)
            ? current
            : ordered[0]?.version || "",
        );
      })
      .catch(() => setPhpRuntimes([]));
    return undefined;
  }, [service.id]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const response = await apiRequest(
      `/api/v1/services/${service.id}/install`,
      { method: "POST", body: JSON.stringify({ version, confirmed: true, install_method: installMethod, php_version: ["composer", "wp-cli"].includes(service.id) ? phpVersion : undefined }) },
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
    <div className="fixed inset-0 z-[70] flex h-[100dvh] min-h-full w-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/50 p-4 sm:p-8">
      <section
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:max-h-[calc(100dvh-4rem)]"
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
          {service.install_methods?.length > 1 && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Installation method
              </legend>
              <label className={`block cursor-pointer rounded-lg border p-3 ${installMethod === "prebuilt" ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20" : "border-slate-200 dark:border-slate-800"}`}>
                <span className="flex items-start gap-3">
                  <input type="radio" name={`${service.id}-install-method`} value="prebuilt" checked={installMethod === "prebuilt"} onChange={() => changeInstallMethod("prebuilt")} className="mt-1 accent-blue-600" disabled={busy} />
                  <span><strong className="block text-sm text-slate-900 dark:text-slate-100">Prebuilt package · Recommended</strong><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Fast installation using the exact compatible {service.name} package fetched for this OS and architecture.</span></span>
                </span>
              </label>
              <label className={`block cursor-pointer rounded-lg border p-3 ${installMethod === "source" ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/20" : "border-slate-200 dark:border-slate-800"}`}>
                <span className="flex items-start gap-3">
                  <input type="radio" name={`${service.id}-install-method`} value="source" checked={installMethod === "source"} onChange={() => changeInstallMethod("source")} className="mt-1 accent-blue-600" disabled={busy} />
                  <span><strong className="block text-sm text-slate-900 dark:text-slate-100">{service.id === "wp-cli" ? "Official release" : "Build from source · Advanced"}</strong><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{service.id === "wp-cli" ? "Downloads the official WP-CLI release and installs it with the latest available PHP runtime." : `Fetches the official ${service.name} source release and builds it inside Server Engine.`}</span></span>
                </span>
              </label>
            </fieldset>
          )}
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
              disabled={refreshing || busy || !versions.length}
              className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-wait disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {versions.map((item) => (
                <option key={item.version} value={item.version}>
                  {item.version} · {item.channel}
                </option>
              ))}
              {!versions.length && (
                <option value="">
                  {refreshing
                    ? `Fetching ${installMethod === "source" ? "source releases" : "compatible packages"}… Please wait`
                    : "No compatible versions found"}
                </option>
              )}
            </select>
          </label>
          {["composer", "wp-cli"].includes(service.id) && (
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              <span>PHP CLI runtime</span>
              <select
                value={phpVersion}
                onChange={(event) => setPhpVersion(event.target.value)}
                disabled={busy || !phpRuntimes.length}
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {phpRuntimes.map((runtime) => <option key={runtime.version} value={runtime.version}>PHP {runtime.version}</option>)}
                {!phpRuntimes.length && <option value="">Install PHP first</option>}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                {service.id === "wp-cli" ? "WP-CLI will use this PHP runtime. If it is removed, the latest installed PHP is selected automatically." : "Composer will use this PHP CLI runtime. If it is removed, the latest installed PHP is selected automatically."}
              </span>
            </label>
          )}
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
              disabled={busy || refreshing || !version || !versions.length || (["composer", "wp-cli"].includes(service.id) && !phpVersion)}
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
