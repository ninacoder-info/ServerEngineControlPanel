import React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Globe2,
  PauseCircle,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionDialog from "../../components/ActionDialog";
import Button from "../../components/Button";
import Toast from "../../components/Toast";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import { apiRequest, readApiError } from "../../lib/api";
import WebsiteFormModal from "./WebsiteFormModal";

const WEB_SERVER_IDS = ["nginx", "apache", "openlitespeed", "caddy"];

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-slate-200 py-3 text-sm dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <strong className="max-w-[65%] truncate text-right font-medium text-slate-900 dark:text-slate-100">
        {children}
      </strong>
    </div>
  );
}

export default function WebsitesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const webServerState = useServiceInstallationState(WEB_SERVER_IDS);
  const selectedId = location.pathname.split("/")[2];
  const [sites, setSites] = React.useState([]);
  const [root, setRoot] = React.useState("/server-engine/www");
  const [php, setPhp] = React.useState([]);
  const [webServerOptions, setWebServerOptions] = React.useState([]);
  const [serverType, setServerType] = React.useState("nginx");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [modal, setModal] = React.useState(null);
  const [dialog, setDialog] = React.useState(null);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const load = React.useCallback(
    () => {
      setLoading(true);
      return Promise.all([
        apiRequest("/api/v1/websites"),
        apiRequest("/api/v1/settings"),
        apiRequest("/api/v1/services/php/runtimes"),
        apiRequest("/api/v1/services/installed"),
      ])
        .then(
          async ([
            websites,
            settingsResponse,
            phpResponse,
            servicesResponse,
          ]) => {
            if (!websites.ok) throw new Error(await readApiError(websites));
            const settings = settingsResponse.ok
              ? await settingsResponse.json()
              : {};
            const runtimes = phpResponse.ok ? await phpResponse.json() : [];
            const services = servicesResponse.ok
              ? await servicesResponse.json()
              : [];
            const installedWebServers = services.filter(
              (item) => WEB_SERVER_IDS.includes(item.id) && item.status !== "not-installed",
            );
            setWebServerOptions(installedWebServers);
            setSites(await websites.json());
            setRoot(settings.values?.default_site_root || "/server-engine/www");
            setPhp(
              runtimes
                .filter((item) => item.installed)
                .map((item) => item.version),
            );
            const running = installedWebServers.find((item) => item.status === "running");
            if (running) setServerType(running.id);
            else if (installedWebServers[0]) setServerType(installedWebServers[0].id);
          },
        )
        .catch((reason) =>
          setError(reason.message || "Unable to load websites"),
        )
        .finally(() => setLoading(false));
    },
    [],
  );
  React.useEffect(() => {
    load();
  }, [load]);
  const selected = sites.find((site) => site.id === selectedId);
  const visible = sites.filter((site) =>
    `${site.name} ${site.domain} ${site.aliases.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const save = (site) =>
    setSites((current) =>
      current.some((item) => item.id === site.id)
        ? current.map((item) => (item.id === site.id ? site : item))
        : [site, ...current],
    );
  const toggle = async (site) => {
    const response = await apiRequest(`/api/v1/websites/${site.id}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: site.enabled ? "disable" : "enable" }),
    });
    if (response.ok) save(await response.json());
    else setError(await readApiError(response));
  };
  const remove = (site) =>
    setDialog({
      kind: "confirm",
      title: `Delete ${site.domain}?`,
      message:
        "The website record and generated metadata will be removed. Project files stay on disk.",
      submitLabel: "Delete record",
      onSubmit: async () => {
        const response = await apiRequest(`/api/v1/websites/${site.id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setSites((current) => current.filter((item) => item.id !== site.id));
          setDialog(null);
          if (selectedId) navigate("/websites");
        } else setError(await readApiError(response));
      },
    });
  const modalProps = {
    site: modal,
    defaultRoot: root,
    phpVersions: php,
    serverType,
    webServerOptions,
    onClose: () => setModal(null),
    onSaved: (site) => {
      const editing = Boolean(modal?.id);
      save(site);
      setModal(null);
      setToast({
        type: "success",
        message: editing
          ? `${site.domain} was updated.`
          : `${site.domain} was created.`,
      });
    },
  };

  if (!loading && !webServerState.loading && !webServerState.installed) {
    return (
      <ServiceNotInstalledState
        state={webServerState}
        icon={Server}
        eyebrow="Web hosting"
        title="No web server is installed"
        description="Install Nginx, Apache HTTP Server, OpenLiteSpeed, or Caddy before creating a website. Once installed, Server Engine will generate the matching website profile and configuration under the shared web root."
        installLabel="Install Nginx"
      />
    );
  }

  if (selectedId && selected)
    return (
      <div className="space-y-7">
        <button
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          onClick={() => navigate("/websites")}
        >
          <ArrowLeft size={15} />
          All websites
        </button>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Website
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {selected.domain}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {selected.project_path} · {selected.server_type} ·{" "}
              {selected.php_version || "static runtime"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setModal(selected)}
            >
              <Edit3 size={15} />
              Edit
            </Button>
            <Button variant="primary" onClick={() => toggle(selected)}>
              {selected.enabled ? (
                <PauseCircle size={15} />
              ) : (
                <CheckCircle2 size={15} />
              )}
              {selected.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
              Runtime
            </h3>
            <DetailRow label="Status">
              <span
                className={
                  selected.enabled
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }
              >
                {selected.enabled ? "Ready" : "Disabled"}
              </span>
            </DetailRow>
            <DetailRow label="Document root">
              {selected.document_root}
            </DetailRow>
            <DetailRow label="Server provider">
              {selected.server_type}
            </DetailRow>
            <DetailRow label="PHP-FPM">
              {selected.php_version || "Not selected"}
            </DetailRow>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
              Domains and policy
            </h3>
            <DetailRow label="Aliases">
              {selected.aliases.length ? selected.aliases.join(", ") : "None"}
            </DetailRow>
            <DetailRow label="TLS">
              {selected.ssl_enabled
                ? selected.ssl_enforce_tls
                  ? "Enabled · enforced"
                  : "Enabled"
                : "Not configured"}
            </DetailRow>
            <DetailRow label="Database">
              {selected.database_enabled
                ? selected.database_name
                : "Not attached"}
            </DetailRow>
            <DetailRow label="Config metadata">
              {selected.config_path}
            </DetailRow>
          </section>
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => window.open(`http://${selected.domain}`, "_blank")}
          >
            <ExternalLink size={15} />
            Open site
          </Button>
          <Button
            variant="danger"
            onClick={() => remove(selected)}
          >
            <Trash2 size={15} />
            Delete record
          </Button>
        </div>
        <WebsiteFormModal {...modalProps} />
        <ActionDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSubmit={() => dialog?.onSubmit?.()}
        />
        <Toast
          message={toast?.message}
          type={toast?.type}
          onClose={() => setToast(null)}
        />
      </div>
    );

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Web hosting
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Websites
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Manage domains, document roots, runtimes, TLS policy, and
            application hosting.
          </p>
        </div>
        <Button variant="primary" onClick={() => setModal({})}>
          <Plus size={16} />
          Create website
        </Button>
      </div>
      {error && (
        <div className="border-b border-rose-300 pb-3 text-sm text-rose-600 dark:border-rose-900 dark:text-rose-400">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <Search size={16} />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search domains or project names…"
          />
        </label>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
          <Globe2 size={15} />
          {loading ? "Loading…" : `${sites.length} websites`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            All websites
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Domains and hosting environments on this server.
          </p>
        </div>
        <Button
          variant="primary"
          className="md:hidden"
          onClick={() => setModal({})}
        >
          <Plus size={15} />
          Create website
        </Button>
      </div>
      {loading ? (
        <div className="space-y-3" aria-label="Loading websites" aria-busy="true">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-800" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-64 max-w-full rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-14 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-12 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="flex gap-1">
                  <div className="h-8 w-8 rounded-md bg-slate-200 dark:bg-slate-800" />
                  <div className="h-8 w-8 rounded-md bg-slate-200 dark:bg-slate-800" />
                  <div className="h-8 w-8 rounded-md bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : visible.length ? (
        <div className="space-y-3">
          {visible.map((site) => (
            <article
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              key={site.id}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                    <Globe2 size={19} />
                  </div>
                  <div className="min-w-0">
                    <button
                      className="cursor-pointer truncate text-left text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      onClick={() => navigate(`/websites/${site.id}`)}
                    >
                      {site.domain}
                    </button>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {site.project_path}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Server size={14} />
                    {site.server_type}
                  </span>
                  <span>
                    {site.php_version ? `PHP ${site.php_version}` : "Static"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    {site.ssl_enabled ? "TLS on" : "TLS off"}
                  </span>
                  <span
                    className={
                      site.enabled
                        ? "font-semibold text-emerald-600 dark:text-emerald-400"
                        : "font-semibold text-amber-600 dark:text-amber-400"
                    }
                  >
                    {site.enabled ? "Ready" : "Disabled"}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    iconOnly
                    aria-label="Open details"
                    title="Open details"
                    onClick={() => navigate(`/websites/${site.id}`)}
                  >
                    <ExternalLink size={15} />
                  </Button>
                  <Button
                    iconOnly
                    aria-label={site.enabled ? "Disable" : "Enable"}
                    title={site.enabled ? "Disable" : "Enable"}
                    onClick={() => toggle(site)}
                  >
                    {site.enabled ? (
                      <PauseCircle size={15} />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                  </Button>
                  <Button
                    iconOnly
                    aria-label="Edit"
                    title="Edit"
                    onClick={() => setModal(site)}
                  >
                    <Edit3 size={15} />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
          <Globe2 size={30} className="text-blue-600" />
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            {query ? "No matching websites" : "No websites configured"}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
            Create the first site and its project folder will be prepared under{" "}
            {root}.
          </p>
          {!query && (
            <Button
              variant="primary"
              className="mt-5"
              onClick={() => setModal({})}
            >
              <Plus size={15} />
              Create website
            </Button>
          )}
        </div>
      )}
      <WebsiteFormModal {...modalProps} />
      <ActionDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSubmit={() => dialog?.onSubmit?.()}
      />
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
