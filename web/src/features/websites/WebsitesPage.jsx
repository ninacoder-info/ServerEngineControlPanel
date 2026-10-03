import React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Globe2,
  PauseCircle,
  Plus,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
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
import ApplicationTemplatesModal from "./ApplicationTemplatesModal";
import ProjectCreateModal from "./ProjectCreateModal";
import ProjectOperationModal from "./ProjectOperationModal";

const WEB_SERVER_IDS = ["nginx", "apache", "openlitespeed", "caddy"];

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-neutral-200 py-3 text-sm dark:border-neutral-800">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <strong className="max-w-[65%] truncate text-right font-medium text-neutral-900 dark:text-neutral-100">
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
  const [databaseEngines, setDatabaseEngines] = React.useState([]);
  const [webServerOptions, setWebServerOptions] = React.useState([]);
  const [serverType, setServerType] = React.useState("nginx");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [modal, setModal] = React.useState(null);
  const [templateModal, setTemplateModal] = React.useState(false);
  const [projectModal, setProjectModal] = React.useState(null);
  const [operation, setOperation] = React.useState(null);
  const [nodeVersions, setNodeVersions] = React.useState([]);
  const [nodeProjects, setNodeProjects] = React.useState([]);
  const [proxyRoutes, setProxyRoutes] = React.useState([]);
  const [inventoryTab, setInventoryTab] = React.useState("all");
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
        apiRequest("/api/v1/databases/engines"),
        apiRequest("/api/v1/projects/node"),
        apiRequest("/api/v1/projects/proxy"),
      ])
        .then(
          async ([
            websites,
            settingsResponse,
            phpResponse,
            servicesResponse,
            databaseResponse,
            nodeResponse,
            proxyResponse,
          ]) => {
            if (!websites.ok) throw new Error(await readApiError(websites));
            const settings = settingsResponse.ok
              ? await settingsResponse.json()
              : {};
            const runtimes = phpResponse.ok ? await phpResponse.json() : [];
            const services = servicesResponse.ok
              ? await servicesResponse.json()
              : [];
            setDatabaseEngines(databaseResponse.ok ? await databaseResponse.json() : []);
            setNodeProjects(nodeResponse.ok ? await nodeResponse.json() : []);
            setProxyRoutes(proxyResponse.ok ? await proxyResponse.json() : []);
            setNodeVersions(services.filter((item) => item.id === "nodejs" || item.id?.startsWith("nodejs@")).map((item) => item.version).filter(Boolean));
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
    const refresh = () => load();
    window.addEventListener("serverengine:jobs-updated", refresh);
    return () => window.removeEventListener("serverengine:jobs-updated", refresh);
  }, [load]);
  const selected = sites.find((site) => site.id === selectedId);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = sites.filter((site) =>
    `${site.name} ${site.domain} ${(site.aliases || []).join(" ")}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const visibleNodeProjects = nodeProjects.filter((project) =>
    `${project.name || ""} ${project.domain} ${project.project_path}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const visibleProxyRoutes = proxyRoutes.filter((route) =>
    `${route.name || ""} ${route.domain} ${route.target}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const showWebsites = inventoryTab === "all" || inventoryTab === "websites";
  const showNodeProjects = inventoryTab === "all" || inventoryTab === "node";
  const showProxyRoutes = inventoryTab === "all" || inventoryTab === "proxy";
  const save = (site) =>
    setSites((current) =>
      current.some((item) => item.id === site.id)
        ? current.map((item) => (item.id === site.id ? site : item))
        : [site, ...current],
    );
  const nodeAction = async (project, action) => {
    const response = await apiRequest(`/api/v1/projects/node/${project.id}/actions`, { method: "POST", body: JSON.stringify({ action }) });
    if (!response.ok) setToast({ type: "error", message: await readApiError(response) });
    else setToast({ type: "success", message: `${action[0].toUpperCase()}${action.slice(1)} requested for ${project.domain}.` });
  };
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
    initialValues: modal?.initialValues,
    databaseEngines,
    defaultRoot: root,
    phpVersions: php,
    serverType,
    webServerOptions,
    onClose: () => setModal(null),
          onSaved: (site, job) => {
            const editing = Boolean(modal?.id);
            save(site);
            setModal(null);
            if (job) {
              setOperation({ job, title: job.type || (editing ? `Update ${site.domain}` : `Create ${site.domain}`) });
            } else {
              setToast({
                type: "success",
                message: editing ? `${site.domain} was updated.` : `${site.domain} was created.`,
              });
            }
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
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              {selected.domain}
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
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
          <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
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
          <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
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
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Websites
          </h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Manage domains, document roots, runtimes, TLS policy, and
            application hosting.
          </p>
        </div>
        <Button variant="primary" onClick={() => setTemplateModal(true)}>
          <Sparkles size={16} />
          Create website or project
        </Button>
      </div>
      {error && (
        <div className="border-b border-rose-300 pb-3 text-sm text-rose-600 dark:border-rose-900 dark:text-rose-400">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          <Search size={16} />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search domains or project names…"
          />
        </label>
        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          <Globe2 size={15} />
          {loading ? "Loading…" : `${sites.length} websites`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Project inventory</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Websites, Node.js applications, and reverse-proxy routes on this server.
          </p>
        </div>
        <Button
          variant="primary"
          className="md:hidden"
          onClick={() => setTemplateModal(true)}
        >
          <Sparkles size={15} />
          Create website or project
        </Button>
      </div>
      <div className="flex flex-nowrap gap-5 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800" role="tablist" aria-label="Project inventory filters">
        {[['all', 'All', sites.length + nodeProjects.length + proxyRoutes.length], ['websites', 'Websites', sites.length], ['node', 'Node.js projects', nodeProjects.length], ['proxy', 'Reverse proxies', proxyRoutes.length]].map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={inventoryTab === id} onClick={() => setInventoryTab(id)} className={`inline-flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold ${inventoryTab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}>{label}<span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{count}</span></button>)}
      </div>
      {loading ? (
        <div className="space-y-3" aria-label="Loading websites" aria-busy="true">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="animate-pulse rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-44 rounded bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-3 w-64 max-w-full rounded bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="h-3 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3 w-14 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3 w-12 rounded bg-neutral-200 dark:bg-neutral-800" />
                </div>
                <div className="flex gap-1">
                  <div className="h-8 w-8 rounded-md bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-8 w-8 rounded-md bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-8 w-8 rounded-md bg-neutral-200 dark:bg-neutral-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : showWebsites && visible.length ? (
        <div className="space-y-3">
          {visible.map((site) => (
            <article
              className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
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
                    <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {site.project_path}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500 dark:text-neutral-400">
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
      ) : showWebsites ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 px-6 py-16 text-center dark:border-neutral-700">
          <Globe2 size={30} className="text-blue-600" />
          <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {query ? "No matching websites" : "No websites configured"}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Create the first site and its project folder will be prepared under{" "}
            {root}.
          </p>
          {!query && (
            <Button
              variant="primary"
              className="mt-5"
              onClick={() => setTemplateModal(true)}
            >
              <Sparkles size={15} />
              Create website or project
            </Button>
          )}
        </div>
      ) : null}
      {(showNodeProjects && visibleNodeProjects.length > 0 || showProxyRoutes && visibleProxyRoutes.length > 0) && <section className="space-y-3"><div><h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{inventoryTab === "node" ? "Node.js projects" : inventoryTab === "proxy" ? "Reverse proxies" : "Projects and proxy routes"}</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Node.js applications and existing services managed alongside PHP websites.</p></div><div className="space-y-3">{showNodeProjects && visibleNodeProjects.map((project) => <article key={project.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><Server size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{project.domain}</p><p className="truncate text-xs text-neutral-500 dark:text-neutral-400">Node.js {project.node_version} · {project.process_manager} · {project.project_path}</p></div></div><div className="flex items-center gap-3"><span className={`text-xs font-semibold ${project.status === "running" ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}>{project.status}</span>{project.process_manager !== "none" && <><Button iconOnly title={project.status === "running" ? "Stop project" : "Start project"} aria-label={project.status === "running" ? "Stop project" : "Start project"} onClick={() => nodeAction(project, project.status === "running" ? "stop" : "start")}>{project.status === "running" ? <RefreshCw size={15} /> : <Play size={15} />}</Button><Button iconOnly title="Restart project" aria-label="Restart project" onClick={() => nodeAction(project, "restart")}><RefreshCw size={15} /></Button></>}</div></div></article>)}{showProxyRoutes && visibleProxyRoutes.map((route) => <article key={route.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><Sparkles size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{route.domain}</p><p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{route.target} · {route.server_type}</p></div></div><span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{route.status}</span></div></article>)}</div></section>}
      {!loading && ((inventoryTab === "node" && !visibleNodeProjects.length) || (inventoryTab === "proxy" && !visibleProxyRoutes.length)) && <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 px-6 py-16 text-center dark:border-neutral-700"><Server size={30} className="text-blue-600" /><h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">{query ? "No matching projects" : `No ${inventoryTab === "node" ? "Node.js projects" : "reverse proxies"} configured`}</h3><p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">Use Create website or project to add one.</p></div>}
      <WebsiteFormModal {...modalProps} />
      {templateModal && (
        <ApplicationTemplatesModal
          onClose={() => setTemplateModal(false)}
          onSelect={(template) => {
            setTemplateModal(false);
            if (template.mode === "node" || template.mode === "proxy") {
              setProjectModal({ mode: template.mode, template });
              return;
            }
            setModal({
              initialValues: {
                application_template: ["wordpress", "laravel", "drupal", "symfony", "cakephp", "codeigniter4", "yii", "slim", "laminas"].includes(template.id) ? template.id : "",
                framework: template.framework,
                web_root: template.documentRoot,
                database_enabled: template.id === "wordpress",
                database_engine: template.id === "wordpress" ? databaseEngines.find((item) => item.id === "mysql" && item.installed && item.running)?.id || "" : "",
                database_user: template.id === "wordpress" ? "wordpress" : "",
                wordpress_admin_user: template.id === "wordpress" ? "admin" : "",
              },
            });
          }}
        />
      )}
      {projectModal && <ProjectCreateModal mode={projectModal.mode} template={projectModal.template} root={root} nodeVersions={nodeVersions} onClose={() => setProjectModal(null)} onCreated={(result, kind) => {
        setProjectModal(null);
        const created = result?.project || result?.route;
        if (result?.job) setOperation({ job: result.job, title: `Create ${created?.domain || kind}` });
        else setToast({ type: "success", message: `${kind} created successfully.` });
      }} />}
      {operation && <ProjectOperationModal jobId={operation.job.id} title={operation.title} onClose={() => setOperation(null)} />}
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
