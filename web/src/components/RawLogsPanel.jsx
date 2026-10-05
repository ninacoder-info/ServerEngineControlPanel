import React from "react";
import { FileText, RefreshCw } from "lucide-react";
import { apiRequest } from "../lib/api";

export const logCategories = ["All", "Apache", "Nginx", "PHP", "Database", "MongoDB", "PostgreSQL", "Redis", "Node", "General"];

export default function RawLogsPanel({ category = "All", onCategoryChange }) {
  const [sources, setSources] = React.useState([]);
  const [selected, setSelected] = React.useState("");
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [reading, setReading] = React.useState(false);

  const loadSources = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest("/api/v1/logs/sources");
      const data = response.ok ? await response.json() : { sources: [] };
      const items = Array.isArray(data.sources) ? data.sources : [];
      setSources(items);
      setSelected((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || "");
    } finally {
      setLoading(false);
    }
  }, []);

  const readSelected = React.useCallback(async (sourceId) => {
    if (!sourceId) return;
    setReading(true);
    try {
      const response = await apiRequest(`/api/v1/logs/sources/${encodeURIComponent(sourceId)}?lines=1000`);
      const data = response.ok ? await response.json() : { lines: [] };
      setContent(Array.isArray(data.lines) ? data.lines.join("\n") : "");
    } finally {
      setReading(false);
    }
  }, []);

  React.useEffect(() => { loadSources(); }, [loadSources]);
  React.useEffect(() => { readSelected(selected); }, [readSelected, selected]);

  const visibleSources = sources.filter((item) => category === "All" || item.category === category);
  return <div className="grid min-h-0 h-full grid-cols-[13rem_minmax(0,1fr)]">
      <div className="min-h-0 overflow-y-auto border-r border-neutral-200 pr-3 dark:border-neutral-800">
        <div className="mb-2 flex items-center justify-between px-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Log files</span><button type="button" title="Refresh logs" className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800" onClick={loadSources}><RefreshCw size={13} /></button></div>
        {loading ? <p className="px-2 py-4 text-xs text-neutral-500">Loading logs…</p> : visibleSources.length === 0 ? <p className="px-2 py-4 text-xs text-neutral-500">No logs found.</p> : visibleSources.map((item) => <button key={item.id} type="button" title={item.path} className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${selected === item.id ? "bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"}`} onClick={() => setSelected(item.id)}><FileText size={13} className="shrink-0" /><span className="truncate">{item.name}</span></button>)}
      </div>
      <div className="min-h-0 overflow-auto pl-4">
        <div className="mb-2 truncate text-[11px] text-neutral-500" title={selected}>{selected || "No log selected"}</div>
        {reading ? <p className="py-8 text-center text-xs text-neutral-500">Reading log…</p> : <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-neutral-800 dark:text-neutral-300">{content || "No log entries recorded."}</pre>}
      </div>
  </div>;
}
