import React from "react";
import {
  Check,
  ChevronRight,
  Copy,
  MoreHorizontal,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import InstallServiceModal from "./InstallServiceModal";

export default function NodeRuntimesPage() {
  const navigate = useNavigate();
  const [service, setService] = React.useState(null);
  const [installed, setInstalled] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [menuVersion, setMenuVersion] = React.useState(null);
  const [copied, setCopied] = React.useState("");
  React.useEffect(() => {
    const closeMenu = (event) => {
      if (!event.target.closest("[data-node-actions]")) setMenuVersion(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([
        apiRequest("/api/v1/services/catalog").then((response) =>
          response.json(),
        ),
        apiRequest("/api/v1/services/installed").then((response) =>
          response.json(),
        ),
      ])
        .then(([catalog, detected]) => {
          if (!alive) return;
          setService(catalog.find((item) => item.id === "nodejs"));
          setInstalled(
            detected.filter(
              (item) => item.id === "nodejs" || item.id.startsWith("nodejs@"),
            ),
          );
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  if (!service)
    return <div className="loading-screen">Loading Node.js runtimes…</div>;
  return (
    <div className="space-y-7">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
          <li>
            <button
              type="button"
              className="font-medium hover:text-blue-600 dark:hover:text-blue-400"
              onClick={() => navigate("/services")}
            >
              Services
            </button>
          </li>
          <li aria-hidden="true">
            <ChevronRight size={15} />
          </li>
          <li
            className="font-medium text-slate-900 dark:text-slate-100"
            aria-current="page"
          >
            Node.js runtimes
          </li>
        </ol>
      </nav>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-cyan-300">Application runtimes</p>
          <h2 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Server size={25} />
            Node.js runtimes
          </h2>
          <p className="mt-2 text-slate-400">
            Install and manage multiple Node.js versions side by side for
            different websites and applications.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() =>
            setSelected({
              service,
              initialVersion: service.versions[0]?.version,
            })
          }
        >
          Install Node.js
        </button>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Channel</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {service.versions.map((item) => {
                const current = installed.find(
                  (entry) => entry.version === item.version,
                );
                return (
                  <tr
                    key={item.version}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-900 dark:text-slate-100">
                      Node.js {item.version}
                    </td>
                    <td className="px-5 py-4 capitalize text-slate-500">
                      {item.channel}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {current ? (
                        <div className="relative flex justify-end" data-node-actions>
                          <span className="group relative">
                            <button
                              type="button"
                              aria-label={`Reinstall Node.js ${item.version}`}
                              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                              onClick={() =>
                                setSelected({
                                  service,
                                  initialVersion: item.version,
                                })
                              }
                            >
                              <RefreshCw size={16} />
                            </button>
                            <span className="pointer-events-none absolute right-0 top-11 z-20 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-white dark:text-slate-900">
                              Reinstall Node.js {item.version}
                            </span>
                          </span>
                          <button
                            type="button"
                            aria-label={`More actions for Node.js ${item.version}`}
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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
                            <div className="absolute right-0 top-11 z-30 w-64 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">
                              {[
                                [
                                  "node",
                                  "Copy Node executable",
                                  `/opt/server-engine/services/nodejs/versions/${item.version}/bin/node`,
                                ],
                                [
                                  "npm",
                                  "Copy npm executable",
                                  `/opt/server-engine/services/nodejs/versions/${item.version}/bin/npm`,
                                ],
                                [
                                  "root",
                                  "Copy runtime directory",
                                  `/opt/server-engine/services/nodejs/versions/${item.version}`,
                                ],
                              ].map(([key, label, path]) => (
                                <button
                                  type="button"
                                  key={key}
                                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(
                                      path.trim(),
                                    );
                                    setCopied(key);
                                    setMenuVersion(null);
                                    window.setTimeout(
                                      () => setCopied(""),
                                      1600,
                                    );
                                  }}
                                >
                                  {copied === key ? (
                                    <Check
                                      size={15}
                                      className="text-emerald-600"
                                    />
                                  ) : (
                                    <Copy size={15} />
                                  )}
                                  {copied === key ? "Copied" : label}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                onClick={() => {
                                  setMenuVersion(null);
                                  setSelected({
                                    service,
                                    initialVersion: item.version,
                                  });
                                }}
                              >
                                <RefreshCw size={15} />
                                Reinstall Node.js {item.version}
                              </button>
                              <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                onClick={async () => {
                                  setMenuVersion(null);
                                  if (
                                    !window.confirm(
                                      `Uninstall Node.js ${item.version}?`,
                                    )
                                  )
                                    return;
                                  const response = await apiRequest(
                                    `/api/v1/services/nodejs/${item.version}`,
                                    { method: "DELETE" },
                                  );
                                  if (response.ok)
                                    setInstalled((currentItems) =>
                                      currentItems.filter(
                                        (entry) =>
                                          entry.version !== item.version,
                                      ),
                                    );
                                }}
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
                          className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          onClick={() =>
                            setSelected({
                              service,
                              initialVersion: item.version,
                            })
                          }
                        >
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
      {selected && (
        <InstallServiceModal
          service={selected.service}
          initialVersion={selected.initialVersion}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
