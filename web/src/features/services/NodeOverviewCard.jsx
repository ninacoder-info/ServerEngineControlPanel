import React from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleStop,
  Server,
  Star,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NodeOverviewCard({
  service,
  installed,
  pinned = false,
  onTogglePin,
}) {
  const navigate = useNavigate();
  const running = installed.filter((item) => item.status === "running").length;
  return (
    <article
      className={`service-card php-overview-card ${pinned ? "service-card-pinned" : ""}`}
      onClick={() => navigate("/services/nodejs")}
    >
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
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="status-pill status-running">
              <Activity size={13} />
              Multi-runtime
            </span>
            <button
              className={`pin-button ${pinned ? "pin-button-active" : ""}`}
              title={pinned ? "Unstar service" : "Star service"}
              aria-label={pinned ? "Unstar Node.js" : "Star Node.js"}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePin(service.id);
              }}
            >
              <Star size={16} fill={pinned ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <div className="php-overview-stats">
          <strong>{installed.length}</strong>
          <span>installed versions</span>
          <span>·</span>
          <strong>{running}</strong>
          <span>running</span>
        </div>
        <div className="php-version-chips">
          {installed.length ? (
            installed.slice(0, 5).map((item) => (
              <span
                key={item.id}
                className={
                  item.status === "running"
                    ? "php-version-chip chip-running"
                    : "php-version-chip"
                }
              >
                {item.status === "running" ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <CircleStop size={12} />
                )}{" "}
                Node {item.version}
              </span>
            ))
          ) : (
            <span className="php-empty-state">
              No Node.js runtime installed yet
            </span>
          )}
        </div>
        <button className="php-overview-link" type="button">
          Open Node runtimes <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}
