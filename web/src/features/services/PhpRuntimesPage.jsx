import React from "react";
import { ChevronRight, Server } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import InstallServiceModal from "./InstallServiceModal";
import PhpRuntimeTable from "./PhpRuntimeTable";
import ServiceManagerModal from "./ServiceManagerModal";

export default function PhpRuntimesPage() {
  const navigate = useNavigate();
  const [service, setService] = React.useState(null);
  const [runtimes, setRuntimes] = React.useState([]);
  const [installed, setInstalled] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [manage, setManage] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([
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
        .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!service)
    return <div className="loading-screen">Loading PHP runtimes…</div>;
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
            Each PHP version has its own process, socket, configuration, logs,
            and extensions.
          </p>
        </div>
      </div>
      <PhpRuntimeTable
        service={service}
        runtimes={runtimes}
        installed={installed}
        onInstall={(item, version) =>
          setSelected({ service: item, initialVersion: version })
        }
        onManage={(item, runtime) =>
          setManage({ service: item, versions: [runtime] })
        }
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
  );
}
