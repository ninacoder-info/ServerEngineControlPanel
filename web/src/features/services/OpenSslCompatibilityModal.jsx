import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";

const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

function RuntimeRow({ version, path }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            OpenSSL {version}
          </span>
        </div>
        <code className="mt-1 block break-all text-xs text-neutral-500 dark:text-neutral-400">
          {path}
        </code>
      </div>
      <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        Installed
      </span>
    </div>
  );
}

export default function OpenSslCompatibilityModal({ service, installed, onClose }) {
  const installedItems = Array.isArray(installed) ? installed : installed ? [installed] : [];
  const [tab, setTab] = React.useState("overview");
  const [versions, setVersions] = React.useState(service.versions || []);
  const [version, setVersion] = React.useState(service.versions?.[0]?.version || "");
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    setVersions(service.versions || []);
    setVersion((current) => current || service.versions?.[0]?.version || "");
  }, [service.versions]);

  const refreshVersions = async () => {
    setRefreshing(true);
    const response = await apiRequest("/api/v1/services/openssl/versions/refresh", { method: "POST" });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (response.ok && body.versions?.length) {
      setVersions(body.versions);
      setVersion((current) => body.versions.some((item) => item.version === current) ? current : body.versions[0].version);
      setToast({ type: "success", message: body.message || "OpenSSL compatibility versions refreshed." });
    } else {
      setToast({ type: "error", message: body.message || "Unable to fetch OpenSSL versions." });
    }
    setRefreshing(false);
  };

  const queueBuild = async () => {
    if (!version) return;
    setBusy(true);
    setMessage(`Preparing isolated OpenSSL ${version}…`);
    const response = await apiRequest("/api/v1/services/openssl/switch-version", {
      method: "POST",
      body: JSON.stringify({ version, install_method: "source", confirmed: true }),
    });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (response.ok) {
      setMessage("");
      setToast({ type: "success", message: body.message || `OpenSSL ${version} build queued.` });
    } else {
      setBusy(false);
      setMessage("");
      setToast({ type: "error", message: body.message || "Unable to queue the OpenSSL build." });
    }
  };

  React.useEffect(() => {
    const onJob = (event) => {
      const job = event.detail?.job;
      if (!job || !String(job.id || "").includes("openssl")) return;
      if (["succeeded", "failed", "cancelled"].includes(job.status)) {
        setBusy(false);
        setMessage("");
        setToast({
          type: job.status === "succeeded" ? "success" : "error",
          message: job.message || (job.status === "succeeded" ? "OpenSSL runtime installed." : `OpenSSL build ${job.status}.`),
        });
      }
    };
    window.addEventListener("serverengine:jobs-updated", onJob);
    return () => window.removeEventListener("serverengine:jobs-updated", onJob);
  }, []);

  const runtimeRoot = "/opt/server-engine/services/openssl/versions";
  const tabs = [
    ["overview", "Overview", ShieldCheck],
    ["runtimes", "Compatibility runtimes", Download],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <ShieldCheck size={21} />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                OpenSSL compatibility runtime
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Private legacy libraries for applications that cannot use the host OpenSSL ABI.
              </p>
            </div>
          </div>
          <button type="button" aria-label="Close OpenSSL runtime" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => (
            <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-5 pt-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Use only for legacy compatibility</h3>
                  <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-300">
                    These isolated runtimes do not replace or modify the operating system OpenSSL installation. OpenSSL 1.1.1 and 1.0.2 are end-of-life and should only be used when an older application requires them.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Installed runtimes</p><strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">{installedItems.length}</strong></div>
              <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Host OpenSSL</p><strong className="mt-1 block text-sm text-emerald-600 dark:text-emerald-400">Untouched</strong></div>
              <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Build method</p><strong className="mt-1 block text-sm text-neutral-900 dark:text-neutral-100">Official source</strong></div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">What this runtime does</h3>
              <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">Server Engine builds each selected OpenSSL release into its own directory so PHP and other legacy builds can link against it without changing system libraries or affecting existing websites.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"><TerminalSquare size={14} />Installed under <code>{runtimeRoot}</code></div>
          </div>
        )}

        {tab === "runtimes" && (
          <div className="space-y-6 pt-5">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Build a compatibility runtime</h3>
                  <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">Choose an official archived source release. The build runs as a background job and does not alter the host OpenSSL installation.</p>
                </div>
                <button type="button" title="Refresh OpenSSL versions" aria-label="Refresh OpenSSL versions" className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={refreshVersions} disabled={refreshing || busy}><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /></button>
              </div>
              <label className="mt-4 block text-sm font-medium text-neutral-700 dark:text-neutral-300">OpenSSL source version
                <select className={`${inputClass} bg-white dark:bg-neutral-950`} value={version} onChange={(event) => setVersion(event.target.value)} disabled={refreshing || busy}>
                  {!versions.length && <option value="">No source versions loaded</option>}
                  {versions.map((item) => <option key={item.version} value={item.version}>{item.version} · {item.channel}</option>)}
                </select>
              </label>
              <button type="button" className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60" onClick={queueBuild} disabled={!version || busy || refreshing}><Download size={15} />{busy ? "Build queued…" : `Build OpenSSL ${version || "runtime"}`}</button>
              {message && <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{message}</p>}
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Installed runtimes</h3>
              <div className="mt-2 rounded-lg border border-neutral-200 px-4 dark:border-neutral-800">
                {installedItems.length ? installedItems.map((item) => <RuntimeRow key={item.id || item.version} version={item.version} path={item.path || `${runtimeRoot}/${item.version}`} />) : <p className="py-5 text-sm text-neutral-500 dark:text-neutral-400">No isolated OpenSSL runtime is installed yet.</p>}
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400"><FileCode2 size={14} className="mt-0.5 shrink-0" />PHP and other source builds can select this runtime automatically when their version requires an older OpenSSL ABI.</div>
          </div>
        )}
      </section>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
