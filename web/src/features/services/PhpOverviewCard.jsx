import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleStop,
  Download,
  Star,
} from "lucide-react";

export default function PhpOverviewCard({
  service,
  installed,
  pinned = false,
  onTogglePin,
  onInstall,
  onOpenRuntimes,
  installing = false,
}) {
  const navigate = useNavigate();
  const running = installed.filter((item) => item.status === "running").length;
  return (
    <article
      className={`flex cursor-pointer gap-4 rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 ${pinned ? "ring-1 ring-blue-600 dark:ring-blue-400" : ""}`}
      onClick={() => navigate("/services/php")}
    >
      <div className="flex shrink-0 flex-col items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-neutral-100 text-blue-600 dark:bg-neutral-800 dark:text-blue-400">
          <img
            src={
              new URL("../../components/icons/php.svg", import.meta.url).href
            }
            width="24"
            height="24"
            alt=""
            aria-hidden="true"
          />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {service.name}
            </h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              {service.description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <Activity size={13} />
              Multi-runtime
            </span>
            <button
              className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 ${pinned ? "text-yellow-500 dark:text-yellow-400" : ""}`}
              title={pinned ? "Unstar service" : "Star service"}
              aria-label={pinned ? "Unstar PHP-FPM" : "Star PHP-FPM"}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePin(service.id);
              }}
            >
              <Star size={16} fill={pinned ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <strong>{installed.length}</strong>
          <span>installed versions</span>
          <span>·</span>
          <strong>{running}</strong>
          <span>running</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {installed.length ? (
            installed.slice(0, 5).map((item) => (
              <span
                key={item.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${item.status === "running" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" : "border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"}`}
              >
                {item.status === "running" ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <CircleStop size={12} />
                )}{" "}
                PHP {item.version}
              </span>
            ))
          ) : (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              No PHP runtime installed yet
            </span>
          )}
        </div>
        <div
          className="mt-4 flex flex-wrap items-center gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            type="button"
            disabled={installing}
            onClick={() =>
              installed.length > 0
                ? navigate("/services/php")
                : onInstall(service)
            }
          >
            {installing ? (
              "Installing…"
            ) : installed.length > 0 ? (
              "Configure service"
            ) : (
              <>
                <Download size={14} />
                Install
              </>
            )}
          </button>
          {installed.length > 0 && (
            <button
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              type="button"
              onClick={() => navigate("/services/php")}
            >
              Open runtimes <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
