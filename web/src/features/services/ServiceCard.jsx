import {
  CheckCircle2,
  Clock3,
  CircleStop,
  Download,
  ExternalLink,
  Info,
  Star,
} from "lucide-react";

import ServiceSvgIcon from "../../components/icons/ServiceSvgIcon";

export default function ServiceCard({
  service,
  installed,
  installedVersions = [],
  onInstall,
  onManage,
  pinned = false,
  onTogglePin,
  installing = false,
}) {
  const active = installed?.status === "running";
  const hostDependency = service.id === "docker";
  const capability = service.mode !== "service" && !installed && !hostDependency;
  const supportsMultipleVersions = service.id === "pm2";
  return (
    <article className={`flex gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${pinned ? "ring-1 ring-blue-600 dark:ring-blue-400" : ""}`}>
      <div className="flex shrink-0 flex-col items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-neutral-100 text-blue-600 dark:bg-neutral-800 dark:text-blue-400">
          <ServiceSvgIcon serviceId={service.id} size={24} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{service.name}</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{service.description}</p>
            {service.requirements && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <Info size={13} />
                {service.requirements}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${active || installed?.status === "installed" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : capability ? "bg-neutral-500/15 text-neutral-600 dark:text-neutral-400" : installed?.status === "stopped" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-400"}`}
            >
              {capability ? (
                <ExternalLink size={13} />
              ) : active ? (
                <CheckCircle2 size={13} />
              ) : installed?.status === "installed" ? (
                <CheckCircle2 size={13} />
              ) : installed?.status === "stopped" ? (
                <CircleStop size={13} />
              ) : (
                <Download size={13} />
              )}{" "}
              {capability
                ? "Not installed"
                : active
                  ? "Running"
                  : installed?.status === "installed"
                    ? "Installed"
                    : installed?.status === "stopped"
                    ? "Stopped"
                    : "Not installed"}
            </span>
            <button
              className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 ${pinned ? "text-yellow-500 dark:text-yellow-400" : ""}`}
              title={pinned ? "Unstar service" : "Star service"}
              aria-label={
                pinned ? `Unstar ${service.name}` : `Star ${service.name}`
              }
              onClick={() => onTogglePin(service.id)}
            >
              <Star size={16} fill={pinned ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span>{service.category}</span>
          <span>{service.license}</span>
          {installed?.version && <span>v{installed.version}</span>}
          {service.default_port && <span>Port {service.default_port}</span>}
          {installedVersions.length > 1 && (
            <span>{installedVersions.length} versions installed</span>
          )}
          {installed?.running_since && (
            <span>
              <Clock3 size={13} />
              Since {new Date(installed.running_since).toLocaleString()}
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {hostDependency && installed ? null : capability ? (
            <a
              href={service.id === "modsecurity" ? "/application-shield" : service.id === "ddos-protection" ? "/firewall#ddos" : service.id === "cloudflare" ? "/domains#cloudflare" : service.id === "malware-scanner" || service.id === "clamav" ? "/malware-scanner" : service.id === "lynis" ? "/health#lynis" : service.id === "node-exporter" ? "/health#node-exporter" : service.id === "logrotate" ? "/logs#logrotate" : service.id === "rabbitmq" ? "/services#rabbitmq" : service.id === "mongodb" ? "/databases#mongodb" : service.id === "sqlserver" ? "/databases#sqlserver" : service.id === "opensearch" ? "/services#opensearch" : service.id === "docker" ? "/services#docker" : service.id === "git" ? "/services#git" : service.id === "wp-cli" ? "/services#wp-cli" : service.id === "imagemagick" ? "/services#imagemagick" : service.id === "ffmpeg" ? "/services#ffmpeg" : service.id === "supervisor" ? "/services#supervisor" : service.id === "pm2" ? "/services#pm2" : service.id === "postfix" ? "/email#postfix" : service.id === "dovecot" ? "/email#dovecot" : service.id === "rspamd" ? "/email#rspamd" : service.id === "stalwart" ? "/email#stalwart" : service.id === "bind9" ? "/domains#bind" : service.id === "unbound" ? "/domains#unbound" : service.id === "auditd" ? "/logs#auditd" : service.management_path || "/settings"}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
            >
              {service.id === "modsecurity" ? "Open Application Shield" : service.management_label || "Open controls"}
              <ExternalLink size={14} />
            </a>
          ) : (
            <button
              className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-2.5 py-1.5 text-sm leading-5 text-white hover:bg-blue-700"
              disabled={installing}
              onClick={() =>
                installed && !supportsMultipleVersions
                  ? onManage(service, installedVersions)
                  : onInstall(service)
              }
            >
              {installing ? (
                "Installing…"
              ) : installed && supportsMultipleVersions ? (
                "Install another version"
              ) : installed ? (
                "Configure service"
              ) : (
                <><Download size={14} />Install</>
              )}
            </button>
          )}
          <a className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white" href="#" onClick={(event) => event.preventDefault()}>
            <ExternalLink size={14} />
            Documentation
          </a>
        </div>
      </div>
    </article>
  );
}
