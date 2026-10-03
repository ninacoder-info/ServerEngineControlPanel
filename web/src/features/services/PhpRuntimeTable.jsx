import React from "react";
import ActionDialog from "../../components/ActionDialog";
import {
  Check,
  CheckCircle2,
  CircleStop,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  Settings2,
  Trash2,
} from "lucide-react";

const linkButton =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300";

export default function PhpRuntimeTable({
  service,
  runtimes,
  installed,
  onInstall,
  onManage,
  onUninstall,
}) {
  const [menuVersion, setMenuVersion] = React.useState(null);
  const [copiedPath, setCopiedPath] = React.useState(null);
  const [uninstallVersion, setUninstallVersion] = React.useState(null);
  React.useEffect(() => {
    const closeMenu = (event) => {
      if (!event.target.closest("[data-php-actions]")) setMenuVersion(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  const copyPath = async (version, path) => {
    if (!path) return;
    await navigator.clipboard.writeText(path);
    setCopiedPath(version);
    setMenuVersion(null);
    window.setTimeout(() => setCopiedPath(null), 1800);
  };

  const copyCliPath = async (version, path) => {
    if (!path) return;
    await navigator.clipboard.writeText(path);
    setCopiedPath(version);
    setMenuVersion(null);
    window.setTimeout(() => setCopiedPath(null), 1800);
  };

  return (
    <section className="overflow-visible rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <div className="overflow-visible">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
            <tr>
              <th className="rounded-tl-lg px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Install method</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Extensions</th>
              <th className="rounded-tr-lg px-4 py-3 text-right font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {runtimes.map((runtime) => {
              const item = installed.find(
                (entry) => entry.id === `php@${runtime.version}`,
              );
              const isInstalled = Boolean(item) || runtime.installed;
              const active =
                isInstalled &&
                (item?.status === "running" || runtime.status === "running");
              const statusClass = active
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : isInstalled
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";

              return (
                <tr
                  key={runtime.version}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <td className="px-4 py-4 font-semibold text-neutral-900 dark:text-neutral-100">
                    PHP {runtime.version}
                  </td>
                  <td className="px-4 py-4 text-neutral-500 dark:text-neutral-400">
                    {runtime.install_method === "source"
                      ? "Build from source"
                      : runtime.install_method === "prebuilt"
                        ? "Prebuilt package"
                        : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                    >
                      {active ? (
                        <CheckCircle2 size={13} />
                      ) : isInstalled ? (
                        <CircleStop size={13} />
                      ) : (
                        <Download size={13} />
                      )}
                      {active
                        ? "Running"
                        : isInstalled
                          ? "Stopped"
                          : "Not installed"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-neutral-500 dark:text-neutral-400">
                    {isInstalled
                      ? `${runtime.extensions.filter((extension) => extension.enabled).length} enabled`
                      : "—"}
                  </td>
                  <td className="relative px-4 py-4 text-right">
                    {isInstalled ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className={linkButton}
                          onClick={() =>
                            onManage(
                              service,
                              item || {
                                ...runtime,
                                id: `php@${runtime.version}`,
                                installed: true,
                              },
                            )
                          }
                        >
                          <Settings2 size={14} />
                          Manage
                        </button>
                        <a
                          className={linkButton}
                          href={`/services/php/${encodeURIComponent(runtime.version)}/info`}
                          title={`View PHP ${runtime.version} information`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={14} />
                          Info
                        </a>
                        <div className="relative" data-php-actions>
                          <button
                            type="button"
                            aria-label={`More actions for PHP ${runtime.version}`}
                            aria-expanded={menuVersion === runtime.version}
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                            onClick={() =>
                              setMenuVersion(
                                menuVersion === runtime.version
                                  ? null
                                  : runtime.version,
                              )
                            }
                          >
                            <MoreHorizontal size={17} />
                          </button>
                          {menuVersion === runtime.version && (
                            <div className="absolute bottom-11 right-0 z-50 w-56 rounded-lg border border-neutral-200 bg-white p-1 text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                              <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                onClick={() =>
                                  copyCliPath(runtime.version, runtime.cli_path)
                                }
                              >
                                {copiedPath === runtime.version ? (
                                  <Check
                                    size={15}
                                    className="text-emerald-600"
                                  />
                                ) : (
                                  <Copy size={15} />
                                )}
                                {copiedPath === runtime.version
                                  ? "Copied PHP CLI path"
                                  : "Copy PHP CLI path"}
                              </button>
                              <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                onClick={() =>
                                  copyPath(runtime.version, runtime.fpm_path)
                                }
                              >
                                <Copy size={15} />
                                Copy PHP-FPM path
                              </button>
                              <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                onClick={() => {
                                  setMenuVersion(null);
                                  setUninstallVersion(runtime.version);
                                }}
                              >
                                <Trash2 size={15} />
                                Uninstall PHP {runtime.version}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                        onClick={() => onInstall(service, runtime.version)}
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
      <ActionDialog
        dialog={
          uninstallVersion
            ? {
                kind: "confirm",
                tone: "danger",
                title: `Uninstall PHP-FPM ${uninstallVersion}?`,
                message:
                  "This removes the selected PHP runtime, its extensions, configuration, logs, and socket from Server Engine.",
                submitLabel: "Uninstall",
                cancelLabel: "Keep installed",
              }
            : null
        }
        onClose={() => setUninstallVersion(null)}
        onSubmit={() => {
          onUninstall(uninstallVersion);
          setUninstallVersion(null);
        }}
      />
    </section>
  );
}
