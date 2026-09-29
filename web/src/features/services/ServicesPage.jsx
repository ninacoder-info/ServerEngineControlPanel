import React from "react";
import { Search, Server } from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import InstallServiceModal from "./InstallServiceModal";
import PhpOverviewCard from "./PhpOverviewCard";
import NodeOverviewCard from "./NodeOverviewCard";
import Pm2OverviewCard from "./Pm2OverviewCard";
import ServiceCard from "./ServiceCard";
import ServiceManagerModal from "./ServiceManagerModal";
import ApacheConfigModal from "./ApacheConfigModal";
import NginxConfigModal from "./NginxConfigModal";
import ComposerConfigModal from "./ComposerConfigModal";
import { VsftpdConfigModal } from "../ftp/FTPPage";
import PowerDnsConfigModal from "./PowerDnsConfigModal";
import Pm2Workspace from "./Pm2Workspace";
import RabbitMqConfigModal from "./RabbitMqConfigModal";
import OpenSearchWorkspace from "./OpenSearchWorkspace";
import DockerWorkspace from "./DockerWorkspace";
import GitConfigModal from "./GitConfigModal";
import PostfixConfigModal from "./PostfixConfigModal";
import WpCliWorkspace from "./WpCliWorkspace";
import ImageMagickConfigModal from "./ImageMagickConfigModal";
import FfmpegConfigModal from "./FfmpegConfigModal";
import NodeRuntimesPage from "./NodeRuntimesPage";

const HIDDEN_SERVICE_IDS = new Set([
  "opensearch",
  "logrotate",
  "bind9",
  "unbound",
]);

export default function ServicesPage() {
  const [catalog, setCatalog] = React.useState([]);
  const [installed, setInstalled] = React.useState([]);
  const [pinned, setPinned] = React.useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("serverengine:pinned-services") || "[]",
      );
    } catch {
      return [];
    }
  });
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(null);
  const [manage, setManage] = React.useState(null);
  const [nodeRuntimesOpen, setNodeRuntimesOpen] = React.useState(false);
  const [ftpConfig, setFtpConfig] = React.useState({
    settings: {},
    service: {},
  });

  React.useEffect(() => {
    localStorage.setItem(
      "serverengine:pinned-services",
      JSON.stringify(pinned),
    );
  }, [pinned]);
  React.useEffect(() => {
    let alive = true;
    const load = () => {
      setLoading(true);
      return Promise.all([
        apiRequest("/api/v1/services/catalog").then((r) => r.json()),
        apiRequest("/api/v1/services/installed").then((r) => r.json()),
      ])
        .then(([services, detected]) => {
          if (alive) {
            setCatalog(services);
            setInstalled(detected);
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
  React.useEffect(() => {
    apiRequest("/api/v1/ftp")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => value && setFtpConfig(value))
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    const openAuditInstaller = () => {
      if (window.location.hash !== "#auditd" || selected) return;
      const auditd = catalog.find((service) => service.id === "auditd");
      const alreadyInstalled = installed.some(
        (service) => service.id === "auditd" || service.id.startsWith("auditd@"),
      );
      if (auditd && !alreadyInstalled) setSelected({ service: auditd });
    };
    openAuditInstaller();
    window.addEventListener("hashchange", openAuditInstaller);
    return () => window.removeEventListener("hashchange", openAuditInstaller);
  }, [catalog, installed, selected]);

  const togglePin = (serviceId) =>
    setPinned((current) =>
      current.includes(serviceId)
        ? current.filter((item) => item !== serviceId)
        : [serviceId, ...current],
    );
  const categories = [
    "All",
    ...new Set(catalog.map((service) => service.category)),
  ];
  const visible = catalog
    .filter(
      (service) =>
        !HIDDEN_SERVICE_IDS.has(service.id) &&
        (category === "All" || category === service.category) &&
        `${service.name} ${service.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)),
    );
  const matchesFor = (service) =>
    installed.filter(
      (item) => item.id === service.id || item.id.startsWith(`${service.id}@`),
    );

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-cyan-300">Infrastructure</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            Services
          </h2>
          <p className="mt-2 text-slate-400">
            Inspect installed software or add a supported service provider.
          </p>
        </div>
        <div className="service-summary">
          <Server size={17} />
          <span>
            {loading ? "Loading…" : installed.filter((item) => item.status === "running").length}{" "}
            {loading ? "" : "running"}
          </span>
          <span>·</span>
          <span>{loading ? "Checking services…" : `${installed.length} detected`}</span>
        </div>
      </div>
      <div className="service-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search services…"
          />
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      {window.location.hash === "#pm2" && <Pm2Workspace />}
      {window.location.hash === "#opensearch" && <OpenSearchWorkspace />}
      {window.location.hash === "#docker" && <DockerWorkspace />}
      {window.location.hash === "#wp-cli" && <WpCliWorkspace />}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading services" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-800" />
                  <div className="space-y-2"><div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" /><div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" /></div>
                </div>
                <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="mt-5 h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-2 h-3 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-6 h-9 w-24 rounded-md bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      ) : <div className="service-grid">
        {visible.map((service) => {
          const matches = matchesFor(service);
          if (service.id === "php")
            return (
              <PhpOverviewCard
                key={service.id}
                service={service}
                installed={matches}
                pinned={pinned.includes(service.id)}
                onTogglePin={togglePin}
                onInstall={(item) => setSelected({ service: item })}
              />
            );
          if (service.id === "nodejs")
            return (
              <NodeOverviewCard
                key={service.id}
                service={service}
                installed={matches}
                pinned={pinned.includes(service.id)}
                onTogglePin={togglePin}
                onInstall={(item) => setSelected({ service: item })}
                onOpenRuntimes={() => setNodeRuntimesOpen(true)}
              />
            );
          if (service.id === "pm2")
            return (
              <Pm2OverviewCard
                key={service.id}
                service={service}
                installed={matches}
                pinned={pinned.includes(service.id)}
                onTogglePin={togglePin}
                onInstall={(item) => setSelected({ service: item })}
                onOpenWorkspace={() => {
                  window.location.hash = "pm2";
                }}
              />
            );
          return (
            <ServiceCard
              key={service.id}
              service={service}
              installed={matches[0]}
              installedVersions={matches}
              pinned={pinned.includes(service.id)}
              onTogglePin={togglePin}
              onInstall={(item) => setSelected({ service: item })}
              onManage={(item, versions) =>
                setManage({ service: item, versions })
              }
            />
          );
        })}
      </div>}
      {selected && (
        <InstallServiceModal
          service={selected.service}
          initialVersion={selected.initialVersion}
          onClose={() => setSelected(null)}
        />
      )}{" "}
      {manage &&
        (manage.service.id === "composer" ? (
          <ComposerConfigModal service={manage.service} installed={manage.versions} onClose={() => setManage(null)} />
        ) : manage.service.id === "apache" ? (
          <ApacheConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : manage.service.id === "nginx" ? (
          <NginxConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : manage.service.id === "vsftpd" ? (
          <VsftpdConfigModal
            service={{
              status:
                ftpConfig.service?.status ||
                manage.versions[0]?.status ||
                "stopped",
              version: manage.versions[0]?.version || "3.0.5",
            }}
            settings={ftpConfig.settings}
            onClose={() => setManage(null)}
            onServiceAction={async (action) => {
              const response = await apiRequest(
                "/api/v1/services/vsftpd/action",
                {
                  method: "POST",
                  body: JSON.stringify({ action }),
                },
              );
              if (!response.ok) {
                throw new Error(
                  await readApiError(response, `Unable to ${action} vsftpd.`),
                );
              }
              const body = await response.json();
              let finalJob;
              for (let attempt = 0; attempt < 30; attempt += 1) {
                await new Promise((resolve) => window.setTimeout(resolve, 700));
                const jobs = await apiRequest("/api/v1/jobs").then((result) =>
                  result.ok ? result.json() : [],
                );
                finalJob = jobs.find((job) => job.id === body.job_id);
                if (
                  finalJob &&
                  ["succeeded", "failed", "cancelled"].includes(finalJob.status)
                )
                  break;
              }
              if (!finalJob || finalJob.status !== "succeeded")
                throw new Error(
                  finalJob?.message || `Unable to ${action} vsftpd.`,
                );
              const refreshed = await apiRequest("/api/v1/ftp");
              if (refreshed.ok) setFtpConfig(await refreshed.json());
            }}
            onSaved={(settings) => {
              setFtpConfig((current) => ({ ...current, settings }));
              setManage(null);
            }}
          />
        ) : manage.service.id === "powerdns" ? (
          <PowerDnsConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : manage.service.id === "imagemagick" ? (
          <ImageMagickConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : manage.service.id === "ffmpeg" ? (
          <FfmpegConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : manage.service.id === "git" ? (
          <GitConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : manage.service.id === "postfix" ? (
          <PostfixConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : manage.service.id === "rabbitmq" ? (
          <RabbitMqConfigModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ) : (
          <ServiceManagerModal
            service={manage.service}
            installed={manage.versions}
            onClose={() => setManage(null)}
          />
        ))}
      {nodeRuntimesOpen && (
        <NodeRuntimesPage modal onClose={() => setNodeRuntimesOpen(false)} />
      )}
    </div>
  );
}
