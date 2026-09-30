import React from "react";
import { ChevronRight, ExternalLink, Server, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import InstallServiceModal from "./InstallServiceModal";
import PhpRuntimeTable from "./PhpRuntimeTable";
import ServiceManagerModal from "./ServiceManagerModal";

export default function PhpRuntimesPage({ modal = false, onClose }) {
  const navigate = useNavigate();
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
    const refreshAfterJob = () => load();
    window.addEventListener("serverengine:jobs-updated", refreshAfterJob);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:jobs-updated", refreshAfterJob);
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
          ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8"
          : ""
      }
    >
      <section
        className={
          modal
            ? "relative max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
            : ""
        }
      >
        {modal && (
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                PHP runtimes ({installedRuntimes.length})
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
                PHP-FPM runtimes
              </li>
            </ol>
          </nav>
          <div className="php-page-heading">
            <div>
              <p className="text-sm text-cyan-300">Application runtimes</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">
                <Server size={25} />
                PHP-FPM runtimes
              </h2>
              <p className="mt-2 text-slate-400">
                Each PHP version has its own process, socket, configuration,
                logs, and extensions.
              </p>
            </div>
          </div>
        </>
      )}
      {loading || phpState.loading ? (
        <div className="animate-pulse overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" aria-label="Loading PHP runtimes" aria-busy="true">
          <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
            {["w-32", "w-24", "w-24", "w-20"].map((width) => <div key={width} className={`h-3 ${width} rounded bg-slate-200 dark:bg-slate-800`} />)}
          </div>
          {[1, 2, 3].map((item) => <div key={item} className="flex items-center gap-4 border-b border-slate-200 px-4 py-5 last:border-0 dark:border-slate-700"><div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" /><div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" /><div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" /><div className="ml-auto h-8 w-20 rounded bg-slate-200 dark:bg-slate-800" /></div>)}
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
        <p className="text-sm text-slate-600 dark:text-slate-300">{notice}</p>
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
