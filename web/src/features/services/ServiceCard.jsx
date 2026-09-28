import {
  CheckCircle2,
  Clock3,
  CircleStop,
  Download,
  ExternalLink,
  Info,
  Server,
  Star,
} from "lucide-react";

export default function ServiceCard({
  service,
  installed,
  installedVersions = [],
  onInstall,
  onManage,
  pinned = false,
  onTogglePin,
}) {
  const active = installed?.status === "running";
  const capability = service.mode !== "service" && !installed;
  return (
    <article className={`service-card ${pinned ? "service-card-pinned" : ""}`}>
      <div className="service-card-top">
        <div className="service-icon">
          <Server size={21} />
        </div>
      </div>
      <div className="service-card-main">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3>{service.name}</h3>
            <p>{service.description}</p>
            {service.requirements && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                <Info size={13} />
                {service.requirements}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`status-pill ${active || installed?.status === "installed" ? "status-running" : capability ? "status-missing" : installed?.status === "stopped" ? "status-stopped" : "status-missing"}`}
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
              className={`pin-button ${pinned ? "pin-button-active" : ""}`}
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
        <div className="service-meta">
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
        <div className="service-actions">
          {capability ? (
            <a
              href={service.id === "modsecurity" ? "/firewall#waf" : service.id === "ddos-protection" ? "/firewall#ddos" : service.id === "cloudflare" ? "/domains#cloudflare" : service.id === "malware-scanner" ? "/health#malware" : service.id === "clamav" ? "/health#clamav" : service.id === "lynis" ? "/health#lynis" : service.id === "node-exporter" ? "/health#node-exporter" : service.id === "logrotate" ? "/logs#logrotate" : service.id === "rabbitmq" ? "/services#rabbitmq" : service.id === "mongodb" ? "/databases#mongodb" : service.id === "sqlserver" ? "/databases#sqlserver" : service.id === "opensearch" ? "/services#opensearch" : service.id === "docker" ? "/services#docker" : service.id === "git" ? "/services#git" : service.id === "wp-cli" ? "/services#wp-cli" : service.id === "imagemagick" ? "/services#imagemagick" : service.id === "ffmpeg" ? "/services#ffmpeg" : service.id === "supervisor" ? "/services#supervisor" : service.id === "pm2" ? "/services#pm2" : service.id === "postfix" ? "/email#postfix" : service.id === "dovecot" ? "/email#dovecot" : service.id === "rspamd" ? "/email#rspamd" : service.id === "stalwart" ? "/email#stalwart" : service.id === "bind9" ? "/domains#bind" : service.id === "unbound" ? "/domains#unbound" : service.id === "auditd" ? "/logs#auditd" : service.management_path || "/settings"}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {service.management_label || "Open controls"}
              <ExternalLink size={14} />
            </a>
          ) : (
            <button
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              onClick={() =>
                installed
                  ? onManage(service, installedVersions)
                  : onInstall(service)
              }
            >
              {installed ? "Configure service" : <><Download size={14} />Install</>}
            </button>
          )}
          <a href="#" onClick={(event) => event.preventDefault()}>
            <ExternalLink size={14} />
            Documentation
          </a>
        </div>
      </div>
    </article>
  );
}
