import React from "react";
import { CheckCircle2, Code2, Cpu, FolderTree, TerminalSquare, X } from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const tabClass = (active) =>
  `inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${active ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500"}`;

export default function ComposerConfigModal({ installed, onClose }) {
  const current = (Array.isArray(installed) ? installed : [installed]).filter(Boolean)[0];
  const [enabled, setEnabled] = React.useState(false);
  const [path, setPath] = React.useState("");
  const [phpVersion, setPhpVersion] = React.useState("");
  const [phpVersions, setPhpVersions] = React.useState([]);
  const [tab, setTab] = React.useState("configuration");
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    Promise.all([
      apiRequest("/api/v1/services/composer/terminal").then((response) => (response.ok ? response.json() : null)),
      apiRequest("/api/v1/services/php/runtimes").then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([composer, runtimes]) => {
        if (composer) {
          setEnabled(composer.enabled);
          setPath(composer.path || "");
          setPhpVersion(composer.php_version || runtimes[0]?.version || "");
        }
        setPhpVersions(runtimes);
      })
      .catch(() => {});
  }, []);

  async function saveSettings() {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/composer/terminal", { method: "PUT", body: JSON.stringify({ enabled, php_version: phpVersion }) });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (response.ok) {
      setPath(body.path || path);
      setPhpVersion(body.php_version || phpVersion);
      setToast({ type: "success", message: "Composer PHP version saved." });
    } else setToast({ type: "error", message: body.message });
    setBusy(false);
  }

  async function saveTerminalAccess() {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/composer/terminal", { method: "PUT", body: JSON.stringify({ enabled, php_version: phpVersion }) });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (response.ok) {
      setPath(body.path || path);
      setToast({ type: "success", message: enabled ? "Composer is available in new local terminal sessions." : "Composer terminal access disabled." });
    } else setToast({ type: "error", message: body.message });
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Composer</h2><p className="mt-1 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={15} /> Installed · v{current?.version || "latest"}</p></div>
          <button type="button" aria-label="Close Composer configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">
          <button type="button" className={tabClass(tab === "configuration")} onClick={() => setTab("configuration")}><Code2 size={15} />Configuration</button>
          <button type="button" className={tabClass(tab === "php")} onClick={() => setTab("php")}><Cpu size={15} />PHP version</button>
          <button type="button" className={tabClass(tab === "terminal")} onClick={() => setTab("terminal")}><TerminalSquare size={15} />Terminal access</button>
        </div>
        {tab === "configuration" && <div className="space-y-5 pt-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Composer configuration</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage the Composer executable and project dependency commands.</p></div><div className="space-y-0 border-y border-slate-200 dark:border-slate-800"><div className="flex items-start gap-3 border-b border-slate-200 py-3 dark:border-slate-800"><FolderTree size={17} className="mt-0.5 text-blue-600" /><div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">Composer executable</p><code className="mt-1 block break-all text-xs text-slate-500 dark:text-slate-400">{path || "Loading…"}</code></div></div><div className="flex items-start gap-3 py-3"><TerminalSquare size={17} className="mt-0.5 text-blue-600" /><div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">Run from any project</p><code className="mt-1 block text-xs text-slate-500 dark:text-slate-400">composer install</code></div></div></div></div>}
        {tab === "php" && <div className="space-y-5 pt-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">PHP version</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose the PHP CLI Composer uses. If this version is removed, Composer falls back to the newest installed PHP.</p></div><label className="block text-sm font-medium text-slate-800 dark:text-slate-200">PHP CLI runtime<select value={phpVersion} onChange={(event) => setPhpVersion(event.target.value)} disabled={busy || !phpVersions.length} className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">{phpVersions.map((runtime) => <option key={runtime.version} value={runtime.version}>PHP {runtime.version}</option>)}{!phpVersions.length && <option value="">Install PHP first</option>}</select></label><div className="flex justify-end"><SaveButton saving={busy} onClick={saveSettings}>Save PHP version</SaveButton></div></div>}
        {tab === "terminal" && <div className="space-y-5 pt-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Terminal access</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Make Composer available as a command in new local terminal sessions.</p></div><label className="flex cursor-pointer items-start gap-3 border-y border-slate-200 py-4 dark:border-slate-800"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600" /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable Composer command</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">This does not change an existing host Composer command.</span></span></label><div className="rounded-md bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"><p className="font-medium">Mapped command</p><code className="mt-1 block break-all">composer → {path || "Loading…"}</code></div><div className="flex justify-end"><SaveButton saving={busy} onClick={saveTerminalAccess}>Save terminal access</SaveButton></div></div>}
      </section>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
