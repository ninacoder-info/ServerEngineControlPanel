import React from "react";
import { Download, ExternalLink, Server, X } from "lucide-react";
import { apiRequest } from "../../lib/api";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import InstallServiceModal from "./InstallServiceModal";
import PhpRuntimeTable from "./PhpRuntimeTable";
import ServiceManagerModal from "./ServiceManagerModal";

export default function PhpRuntimesPage({ modal = false, onClose }) {
  const phpState = useServiceInstallationState("php");
  const [service, setService] = React.useState(null);
  const [runtimes, setRuntimes] = React.useState([]);
  const [installed, setInstalled] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [manage, setManage] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const installedRuntimes = React.useMemo(
    () => runtimes.filter(
      (runtime) =>
        runtime.installed ||
        installed.some((item) => item.id === `php@${runtime.version}`),
    ),
    [installed, runtimes],
  );
  React.useEffect(() => {
    let alive = true;
    const load = () => {
      setLoading(true);
      return Promise.all([
        apiRequest("/api/v1/services/catalog").then((r) => r.json()),
        apiRequest("/api/v1/services/installed").then((r) => r.json()),
        apiRequest("/api/v1/services/php/runtimes").then((r) => r.json()),
      ])
        .then(([catalog, detected, available]) => {
          if (alive) {
            setService(catalog.find((item) => item.id === "php"));
            setInstalled(detected.filter((item) => item.id.startsWith("php@")));
            setRuntimes(available);
          }
        })
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    };
    load();
    const refreshAfterJob = (event) => {
      const job = event.detail?.job;
      if (!job || !["succeeded", "failed", "cancelled"].includes(job.status)) {
        return;
      }
      const type = String(job.type || "").toLowerCase();
      if (!/(^|\s)(install|uninstall|switch)\s+php(?:-fpm)?\b/.test(type)) {
        return;
      }
      // Do not reload the runtime inventory for every build-progress event.
      // The shared jobs socket emits progress frequently; refresh once after
      // the PHP operation reaches a terminal state.
      load();
    };
    const refreshAfterServiceStatus = (event) => {
      const detail = event.detail;
      if (!detail || detail.serviceId !== "php") return;
      if (["start", "stop", "restart"].includes(detail.action)) {
        if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;
        const version = detail.version || detail.job?.version;
        if (!version) return;
        const nextStatus = detail.status === "succeeded" && ["start", "restart"].includes(detail.action)
          ? "running"
          : detail.status === "succeeded" && detail.action === "stop"
            ? "stopped"
            : null;
        if (!nextStatus) return;
        setInstalled((current) => current.map((item) => item.version === version ? { ...item, status: nextStatus } : item));
        setRuntimes((current) => current.map((item) => item.version === version ? { ...item, status: nextStatus } : item));
        return;
      }
      if (!["install", "uninstall", "switch"].includes(detail.action)) return;
      if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;
      // The service-status event is emitted directly by the shared jobs socket.
      // Use it as the authoritative completion signal so a newly installed
      // PHP-FPM version appears without a reload or background polling.
      load();
    };
    window.addEventListener("serverengine:jobs-updated", refreshAfterJob);
    window.addEventListener("serverengine:service-status", refreshAfterServiceStatus);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:jobs-updated", refreshAfterJob);
      window.removeEventListener("serverengine:service-status", refreshAfterServiceStatus);
    };
  }, []);
  if (!loading && !phpState.loading && !phpState.installed) {
    return (
      <ServiceNotInstalledState
        state={phpState}
        icon={Server}
        eyebrow="Application runtimes"
        title="PHP-FPM is not installed"
        description="Install PHP-FPM to run PHP websites. You can install and run multiple PHP versions side by side, each with its own configuration and extensions."
        installLabel="Install PHP-FPM"
      />
    );
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
            : ""
        }
      >
        {modal && (
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                PHP runtimes ({installedRuntimes.length})
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Manage installed PHP-FPM versions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={
                  installedRuntimes[0]?.version
                    ? `/services/php/${encodeURIComponent(installedRuntimes[0].version)}/info`
                    : "/services"
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ExternalLink size={15} />
                PHP info
              </a>
              <button
                type="button"
                aria-label="Close PHP runtimes"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      <div className={`space-y-7 ${modal ? "pr-2" : ""}`}>
      {!modal && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Application runtimes</p>
              <h2 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight">
                <Server size={25} />
                PHP-FPM runtimes
              </h2>
              <p className="mt-2 text-neutral-400">
                Each PHP version has its own process, socket, configuration,
                logs, and extensions.
              </p>
            </div>
            <button
              type="button"
              disabled={!service || loading}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              onClick={() => setSelected({ service })}
            >
              <Download size={14} />
              Install
            </button>
          </div>
        </>
      )}
      {loading || phpState.loading ? (
        <div className="animate-pulse overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700" aria-label="Loading PHP runtimes" aria-busy="true">
          <div className="flex gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950">
            {["w-32", "w-24", "w-24", "w-20"].map((width) => <div key={width} className={`h-3 ${width} rounded bg-neutral-200 dark:bg-neutral-800`} />)}
          </div>
          {[1, 2, 3].map((item) => <div key={item} className="flex items-center gap-4 border-b border-neutral-200 px-4 py-5 last:border-0 dark:border-neutral-700"><div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="ml-auto h-8 w-20 rounded bg-neutral-200 dark:bg-neutral-800" /></div>)}
        </div>
      ) : !phpState.installed ? (
        <ServiceNotInstalledState
          state={phpState}
          icon={Server}
          eyebrow="Application runtimes"
          title="PHP-FPM is not installed"
          description="Install PHP-FPM to run PHP websites. You can install and run multiple PHP versions side by side, each with its own configuration and extensions."
          installLabel="Install PHP-FPM"
        />
      ) : (
        <PhpRuntimeTable
          service={service}
          runtimes={installedRuntimes}
          installed={installed}
          onInstall={(item, version) => setSelected({ service: item, initialVersion: version })}
          onManage={(item, runtime) => setManage({ service: item, versions: [runtime] })}
          onUninstall={(version) => {
            apiRequest(`/api/v1/services/php/${version}`, { method: "DELETE" })
              .then(async (response) => {
                if (!response.ok) throw new Error("Unable to uninstall PHP-FPM");
                setNotice(`PHP-FPM ${version} uninstall started.`);
              })
              .catch((error) => setNotice(error.message))
              .finally(() => window.setTimeout(() => setNotice(null), 3500));
          }}
        />
      )}
      {notice && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{notice}</p>
      )}
      {selected && (
        <InstallServiceModal
          service={selected.service}
          initialVersion={selected.initialVersion}
          onClose={() => setSelected(null)}
        />
      )}{" "}
      {manage && (
        <ServiceManagerModal
          service={manage.service}
          installed={manage.versions}
          onClose={() => setManage(null)}
        />
      )}
      </div>
      </section>
    </div>
  );
}
