import React from "react";
import { Check, CheckCircle2, ChevronRight, CircleStop, Copy, Download, MoreHorizontal, RefreshCw, Server, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import InstallServiceModal from "./InstallServiceModal";

const linkButton = "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300";

export default function NodeRuntimesPage({ modal = false, onClose }) {
  const navigate = useNavigate();
  const [service, setService] = React.useState(null);
  const [installed, setInstalled] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [menuVersion, setMenuVersion] = React.useState(null);
  const [copiedPath, setCopiedPath] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  const load = React.useCallback(async () => {
    const [catalogResponse, installedResponse] = await Promise.all([
      apiRequest("/api/v1/services/catalog"),
      apiRequest("/api/v1/services/installed"),
    ]);
    const catalog = await catalogResponse.json();
    const detected = await installedResponse.json();
    setService(catalog.find((item) => item.id === "nodejs"));
    setInstalled(detected.filter((item) => item.id === "nodejs" || item.id.startsWith("nodejs@")));
  }, []);

  React.useEffect(() => {
    load().catch(() => {});
    const refreshAfterJob = () => load().catch(() => {});
    window.addEventListener("serverengine:jobs-updated", refreshAfterJob);
    return () => window.removeEventListener("serverengine:jobs-updated", refreshAfterJob);
  }, [load]);

  React.useEffect(() => {
    const closeMenu = (event) => {
      if (!event.target.closest("[data-node-actions]")) setMenuVersion(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  const installedVersions = installed
    .filter((item) => item.id === "nodejs" || item.id.startsWith("nodejs@"))
    .sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
  const rows = installedVersions.map((item) => ({ version: item.version, channel: "installed" }));

  async function copyPath(version, kind) {
    const root = `/opt/server-engine/services/nodejs/versions/${version}`;
    await navigator.clipboard.writeText(kind === "root" ? root : `${root}/bin/${kind}`);
    setCopiedPath(`${version}-${kind}`);
    setMenuVersion(null);
    window.setTimeout(() => setCopiedPath(null), 1800);
  }

  async function uninstall(version) {
    const response = await apiRequest(`/api/v1/services/nodejs/${version}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice("Unable to uninstall this Node.js runtime.");
      return;
    }
    setInstalled((current) => current.filter((item) => item.version !== version));
    setMenuVersion(null);
    setNotice(`Node.js ${version} uninstall started.`);
    window.setTimeout(() => setNotice(null), 3500);
  }

  if (!service) return <div className="loading-screen">Loading Node.js runtimes…</div>;

  return (
    <div className={modal ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8" : ""}>
      <section className={modal ? "relative max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900" : "space-y-7"}>
        {modal ? (
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Node.js runtimes ({installedVersions.length})</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage installed Node.js versions.</p>
            </div>
            <button type="button" aria-label="Close Node.js runtimes" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button>
          </div>
        ) : (
          <>
            <nav aria-label="Breadcrumb"><ol className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><li><button type="button" className="font-medium hover:text-blue-600 dark:hover:text-blue-400" onClick={() => navigate("/services")}>Services</button></li><li aria-hidden="true"><ChevronRight size={15} /></li><li className="font-medium text-slate-900 dark:text-slate-100" aria-current="page">Node.js runtimes</li></ol></nav>
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-cyan-300">Application runtimes</p><h2 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight"><Server size={25} />Node.js runtimes</h2><p className="mt-2 text-slate-400">Install and manage multiple Node.js versions side by side.</p></div><button type="button" className={`${linkButton} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => setSelected({ service })}><Download size={14} />Install</button></div>
          </>
        )}
        <section className="overflow-visible rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><div className="overflow-visible"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold">Version</th><th className="px-4 py-3 font-semibold">Channel</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold" /></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {!rows.length && (
            <tr>
              <td colSpan="4" className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No Node.js versions are installed yet.
              </td>
            </tr>
          )}
          {rows.map((item) => {
            const current = installedVersions.find((entry) => entry.version === item.version);
            const active = current?.status === "running";
            return <tr key={item.version} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-4 font-semibold text-slate-900 dark:text-slate-100">Node.js {item.version}</td><td className="px-4 py-4 capitalize text-slate-500 dark:text-slate-400">{item.channel || "—"}</td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : current ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>{active ? <CheckCircle2 size={13} /> : current ? <CircleStop size={13} /> : <Download size={13} />}{active ? "Running" : current ? "Installed" : "Not installed"}</span></td><td className="relative px-4 py-4 text-right">{current ? <div className="relative flex items-center justify-end gap-2" data-node-actions><button type="button" className={linkButton} onClick={() => setSelected({ service, initialVersion: item.version })}><RefreshCw size={14} />Reinstall</button><button type="button" aria-label={`More actions for Node.js ${item.version}`} className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100" onClick={() => setMenuVersion(menuVersion === item.version ? null : item.version)}><MoreHorizontal size={17} /></button>{menuVersion === item.version && <div className="absolute bottom-11 right-0 z-50 w-60 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">{["node", "npm", "root"].map((kind) => <button key={kind} type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => copyPath(item.version, kind)}>{copiedPath === `${item.version}-${kind}` ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}{copiedPath === `${item.version}-${kind}` ? "Copied" : `Copy ${kind === "root" ? "runtime directory" : `${kind} executable`}`}</button>)}<button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => uninstall(item.version)}><Trash2 size={15} />Uninstall Node.js {item.version}</button></div>}</div> : <button type="button" className={linkButton} onClick={() => setSelected({ service, initialVersion: item.version })}><Download size={14} />Install</button>}</td></tr>;
          })}
        </tbody></table></div></section>
        {notice && <p className="text-sm text-slate-600 dark:text-slate-300">{notice}</p>}
        {selected && <InstallServiceModal service={selected.service} initialVersion={selected.initialVersion} onClose={() => setSelected(null)} />}
      </section>
    </div>
  );
}
