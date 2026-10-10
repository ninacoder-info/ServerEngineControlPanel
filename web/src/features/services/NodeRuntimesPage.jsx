import React from "react";
import {
  Check,
  CheckCircle2,
  CircleStop,
  Copy,
  Download,
  MoreHorizontal,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { apiRequest } from "../../lib/api";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import InstallServiceModal from "./InstallServiceModal";

const linkButton =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300";

export default function NodeRuntimesPage({ modal = false, onClose }) {
  const nodeState = useServiceInstallationState("nodejs");
  const [service, setService] = React.useState(null);
  const [installed, setInstalled] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [menuVersion, setMenuVersion] = React.useState(null);
  const [copiedPath, setCopiedPath] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const [catalogResponse, installedResponse] = await Promise.all([
      apiRequest("/api/v1/services/catalog"),
      apiRequest("/api/v1/services/installed"),
    ]);
    const catalog = await catalogResponse.json();
    const detected = await installedResponse.json();
    setService(catalog.find((item) => item.id === "nodejs"));
    setInstalled(
      detected.filter(
        (item) => item.id === "nodejs" || item.id.startsWith("nodejs@"),
      ),
    );
  }, []);

  React.useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
    const refreshAfterJob = () => load().catch(() => {});
    window.addEventListener("serverengine:jobs-updated", refreshAfterJob);
    return () =>
      window.removeEventListener("serverengine:jobs-updated", refreshAfterJob);
  }, [load]);

  React.useEffect(() => {
    const closeMenu = (event) => {
      if (!event.target.closest("[data-node-actions]")) setMenuVersion(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  if (!loading && !nodeState.loading && !nodeState.installed) {
    return (
      <ServiceNotInstalledState
        state={nodeState}
        icon={Server}
        eyebrow="Application runtimes"
        title="Node.js is not installed"
        description="Install Node.js to run JavaScript applications. You can install and manage multiple Node.js versions side by side."
        installLabel="Install Node.js"
      />
    );
  }

  const installedVersions = installed
    .filter((item) => item.id === "nodejs" || item.id.startsWith("nodejs@"))
    .sort((a, b) =>
      String(b.version).localeCompare(String(a.version), undefined, {
        numeric: true,
      }),
    );
  const rows = installedVersions;

  async function copyPath(version, kind) {
    const root = `/opt/server-engine/services/nodejs/versions/${version}`;
    await navigator.clipboard.writeText(
      kind === "root" ? root : `${root}/bin/${kind}`,
    );
    setCopiedPath(`${version}-${kind}`);
    setMenuVersion(null);
    window.setTimeout(() => setCopiedPath(null), 1800);
  }

  async function uninstall(version) {
    const response = await apiRequest(`/api/v1/services/nodejs/${version}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setNotice("Unable to uninstall this Node.js runtime.");
      return;
    }
    setInstalled((current) =>
      current.filter((item) => item.version !== version),
    );
    setMenuVersion(null);
    setNotice(`Node.js ${version} uninstall started.`);
    window.setTimeout(() => setNotice(null), 3500);
  }

  return (
    <div
      className={
        modal
          ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/50 p-4 sm:p-8"
          : ""
      }
    >
      <section
        className={
          modal
            ? "relative max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
            : "space-y-7"
        }
      >
        {modal ? (
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Node.js runtimes ({installedVersions.length})
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Manage installed Node.js versions.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close Node.js runtimes"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  Application runtimes
                </p>
                <h2 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight">
                  <Server size={25} />
                  Node.js runtimes
                </h2>
                <p className="mt-2 text-neutral-400">
                  Install and manage multiple Node.js versions side by side.
                </p>
              </div>
              <button
                type="button"
                disabled={!service || loading}
                className={`${linkButton} bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60`}
                onClick={() => setSelected({ service })}
              >
                <Download size={14} />
                Install
              </button>
            </div>
          </>
        )}
        {loading || nodeState.loading ? (
          <div
            className="animate-pulse overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700"
            aria-label="Loading Node.js runtimes"
            aria-busy="true"
          >
            <div className="flex gap-4 bg-neutral-50 px-4 py-3 dark:bg-neutral-950">
              {["w-32", "w-24", "w-24", "w-20"].map((width) => (
                <div
                  key={width}
                  className={`h-3 ${width} rounded bg-neutral-200 dark:bg-neutral-800`}
                />
              ))}
            </div>
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="flex items-center gap-4 border-t border-neutral-200 px-4 py-5 dark:border-neutral-700"
              >
                <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-5 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                <div className="ml-auto h-8 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : !nodeState.installed ? (
          <ServiceNotInstalledState
            state={nodeState}
            icon={Server}
            eyebrow="Application runtimes"
            title="Node.js is not installed"
            description="Install Node.js to run JavaScript applications. You can install and manage multiple Node.js versions side by side."
            installLabel="Install Node.js"
          />
        ) : (
          <section className="overflow-visible rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div className="overflow-visible">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
                  <tr>
                    <th className="rounded-tl-lg px-4 py-3 font-semibold">
                      Version
                    </th>
                    <th className="px-4 py-3 font-semibold">Install method</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="rounded-tr-lg px-4 py-3 text-right font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {!rows.length && (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400"
                      >
                        No Node.js versions are installed yet.
                      </td>
                    </tr>
                  )}
                  {rows.map((item) => {
                    const current = installedVersions.find(
                      (entry) => entry.version === item.version,
                    );
                    const active = current?.status === "running";
                    // Every row comes from the installed-runtime inventory. A stopped
                    // process is still an installed runtime, not a missing runtime.
                    const installedState = Boolean(current);
                    const installMethod =
                      current?.install_method === "source"
                        ? "Build from source"
                        : current?.install_method === "prebuilt"
                          ? "Prebuilt package"
                          : "—";
                    const statusTone =
                      active || installedState
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : current
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
                    return (
                      <tr
                        key={item.version}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      >
                        <td className="px-4 py-4 font-semibold text-neutral-900 dark:text-neutral-100">
                          Node.js {item.version}
                        </td>
                        <td className="px-4 py-4 text-neutral-500 dark:text-neutral-400">
                          {installMethod}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}
                          >
                            {active || installedState ? (
                              <CheckCircle2 size={13} />
                            ) : current ? (
                              <CircleStop size={13} />
                            ) : (
                              <Download size={13} />
                            )}
                            {active
                              ? "Running"
                              : installedState
                                ? "Installed"
                                : current
                                  ? "Stopped"
                                  : "Not installed"}
                          </span>
                        </td>
                        <td className="relative px-4 py-4 text-right">
                          {current ? (
                            <div
                              className="relative flex items-center justify-end gap-2"
                              data-node-actions
                            >
                              <button
                                type="button"
                                className={linkButton}
                                onClick={() =>
                                  setSelected({
                                    service,
                                    initialVersion: item.version,
                                  })
                                }
                              >
                                <RefreshCw size={14} />
                                Reinstall
                              </button>
                              <button
                                type="button"
                                aria-label={`More actions for Node.js ${item.version}`}
                                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                                onClick={() =>
                                  setMenuVersion(
                                    menuVersion === item.version
                                      ? null
                                      : item.version,
                                  )
                                }
                              >
                                <MoreHorizontal size={17} />
                              </button>
                              {menuVersion === item.version && (
                                <div className="absolute bottom-11 right-0 z-50 w-60 rounded-lg border border-neutral-200 bg-white p-1 text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                                  {["node", "npm", "root"].map((kind) => (
                                    <button
                                      key={kind}
                                      type="button"
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                      onClick={() =>
                                        copyPath(item.version, kind)
                                      }
                                    >
                                      {copiedPath ===
                                      `${item.version}-${kind}` ? (
                                        <Check
                                          size={15}
                                          className="text-emerald-600"
                                        />
                                      ) : (
                                        <Copy size={15} />
                                      )}
                                      {copiedPath === `${item.version}-${kind}`
                                        ? "Copied"
                                        : `Copy ${kind === "root" ? "runtime directory" : `${kind} executable`}`}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                    onClick={() => uninstall(item.version)}
                                  >
                                    <Trash2 size={15} />
                                    Uninstall Node.js {item.version}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={linkButton}
                              onClick={() =>
                                setSelected({
                                  service,
                                  initialVersion: item.version,
                                })
                              }
                            >
                              <Download size={14} />
                              Install
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {notice && (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {notice}
          </p>
        )}
        {selected && (
          <InstallServiceModal
            service={selected.service}
            initialVersion={selected.initialVersion}
            onClose={() => setSelected(null)}
          />
        )}
      </section>
    </div>
  );
}
