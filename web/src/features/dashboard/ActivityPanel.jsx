import React from "react";
import { Activity as ActivityIcon, TerminalSquare } from "lucide-react";
import { apiRequest } from "../../lib/api";

function Event({ event }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-4 last:border-0 last:pb-0 dark:border-neutral-800">
      <span className="min-w-0 truncate text-sm text-neutral-700 dark:text-neutral-300">
        {event.type || event.detail}
      </span>
      <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-500">
        {event.time ? new Date(event.time).toLocaleString() : "—"}
      </span>
    </div>
  );
}
export default function ActivityPanel() {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const response = await apiRequest("/api/v1/activity?range=24h");
      if (!response.ok) return;
      const next = await response.json();
      setEvents(Array.isArray(next) ? next.slice(0, 3) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const onActivity = (event) => {
      if (!event.detail) return;
      setEvents((current) =>
        [
          event.detail,
          ...current.filter((item) => item.id !== event.detail.id),
        ].slice(0, 3),
      );
    };
    const onJobs = () => load();
    window.addEventListener("serverengine:activity", onActivity);
    window.addEventListener("serverengine:jobs-updated", onJobs);
    return () => {
      window.removeEventListener("serverengine:activity", onActivity);
      window.removeEventListener("serverengine:jobs-updated", onJobs);
    };
  }, [load]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-violet-400/10 p-2 text-violet-300">
          <TerminalSquare size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Activity
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Recent control-plane events
          </p>
        </div>
      </div>
      <div className="mt-7 space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-neutral-500 dark:text-neutral-400">
            <ActivityIcon size={15} className="animate-pulse" /> Loading
            activity…
          </div>
        ) : events.length ? (
          events.map((event) => <Event key={event.id} event={event} />)
        ) : (
          <p className="py-3 text-sm text-neutral-500 dark:text-neutral-400">
            No recent activity.
          </p>
        )}
      </div>
    </div>
  );
}
