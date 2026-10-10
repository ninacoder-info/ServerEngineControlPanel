import React from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Clipboard,
  Download,
  Eraser,
  FileText,
  RefreshCw,
  Trash2,
  WrapText,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import ActionDialog from "./ActionDialog";

export const logCategories = [
  "All",
  "Websites",
  "Apache",
  "Nginx",
  "PHP",
  "Database",
  "MongoDB",
  "PostgreSQL",
  "Redis",
  "Node",
  "General",
];

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatModified(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value * 1000));
}

export default function RawLogsPanel({
  category = "All",
  onCategoryChange,
  toolbarHostRef,
}) {
  const [sources, setSources] = React.useState([]);
  const [selected, setSelected] = React.useState("");
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [reading, setReading] = React.useState(false);
  const [tailing, setTailing] = React.useState(false);
  const [lineLimit, setLineLimit] = React.useState(100);
  const [wrap, setWrap] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [toolbarReady, setToolbarReady] = React.useState(false);

  React.useLayoutEffect(() => {
    setToolbarReady(Boolean(toolbarHostRef?.current));
  }, [toolbarHostRef]);

  const loadSources = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest("/api/v1/logs/sources");
      const data = response.ok ? await response.json() : { sources: [] };
      const items = Array.isArray(data.sources) ? data.sources : [];
      setSources(items);
      setSelected((current) =>
        current && items.some((item) => item.id === current)
          ? current
          : items[0]?.id || "",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const readSelected = React.useCallback(
    async (sourceId, requestedLines = 1000) => {
      if (!sourceId) return;
      setReading(true);
      try {
        const response = await apiRequest(
          `/api/v1/logs/sources/${encodeURIComponent(sourceId)}?lines=${requestedLines}`,
        );
        const data = response.ok ? await response.json() : { lines: [] };
        setContent(Array.isArray(data.lines) ? data.lines.join("\n") : "");
      } finally {
        setReading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    loadSources();
  }, [loadSources]);
  React.useEffect(() => {
    readSelected(selected);
  }, [readSelected, selected]);
  React.useEffect(() => {
    const refresh = () => loadSources();
    const applyLogUpdate = (event) => {
      const { action, id } = event.detail || {};
      if (!id) return;
      if (action === "cleared") {
        setSources((current) =>
          current.map((item) => (item.id === id ? { ...item, size: 0 } : item)),
        );
        if (selected === id) setContent("");
      }
      if (action === "deleted") {
        setSources((current) => {
          const next = current.filter((item) => item.id !== id);
          if (selected === id) {
            setSelected(next[0]?.id || "");
            setContent("");
          }
          return next;
        });
      }
    };
    window.addEventListener("serverengine:websites-updated", refresh);
    window.addEventListener("serverengine:logs-updated", applyLogUpdate);
    return () => {
      window.removeEventListener("serverengine:websites-updated", refresh);
      window.removeEventListener("serverengine:logs-updated", applyLogUpdate);
    };
  }, [loadSources, selected]);

  const clearSource = async (event, item) => {
    event.stopPropagation();
    setConfirmDialog({
      kind: "confirm",
      title: `Clear ${item.label || item.name}?`,
      message:
        "This removes the current contents but keeps the log file available for new entries.",
      submitLabel: "Clear log",
      tone: "danger",
      onSubmit: async () => {
        const response = await apiRequest(
          `/api/v1/logs/sources/${encodeURIComponent(item.id)}/clear`,
          { method: "POST" },
        );
        setConfirmDialog(null);
        if (!response.ok) return;
        setSources((current) =>
          current.map((source) =>
            source.id === item.id ? { ...source, size: 0 } : source,
          ),
        );
        if (selected === item.id) setContent("");
      },
    });
  };

  const deleteSource = async (event, item) => {
    event.stopPropagation();
    setConfirmDialog({
      kind: "confirm",
      title: `Delete ${item.label || item.name}?`,
      message:
        "This permanently removes the log file. New entries may recreate it when the service writes again.",
      submitLabel: "Delete log",
      tone: "danger",
      onSubmit: async () => {
        const response = await apiRequest(
          `/api/v1/logs/sources/${encodeURIComponent(item.id)}`,
          { method: "DELETE" },
        );
        setConfirmDialog(null);
        if (!response.ok) return;
        setSources((current) => {
          const next = current.filter((source) => source.id !== item.id);
          if (selected === item.id) {
            setSelected(next[0]?.id || "");
            setContent("");
          }
          return next;
        });
      },
    });
  };

  const copyContent = async () => {
    if (!content) return;
    await navigator.clipboard?.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const downloadContent = () => {
    if (!selectedItem) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = selectedItem.name || "server-engine.log";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = (
    label,
    Icon,
    onClick,
    active = false,
    compact = false,
  ) => (
    <span className="group/log-tooltip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={`inline-flex ${compact ? "h-5 w-5 rounded" : "h-7 w-7 rounded-md"} cursor-pointer items-center justify-center hover:text-neutral-900 dark:hover:text-neutral-100 ${active ? "text-blue-600 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`}
      >
        {Icon === Check ? (
          <Check size={compact ? 11 : 14} />
        ) : (
          <Icon size={compact ? 11 : 14} />
        )}
      </button>
      <span className="pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/log-tooltip:opacity-100 dark:bg-white dark:text-neutral-900">
        {label}
      </span>
    </span>
  );

  const tailToggle = (
    <span className="group/log-tooltip relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={tailing}
        aria-label={tailing ? "Disable tail mode" : "Enable tail mode"}
        onClick={() => {
          const next = !tailing;
          setTailing(next);
          readSelected(selected, next ? lineLimit : 1000);
        }}
        className={`relative inline-flex h-4 w-7 cursor-pointer items-center rounded-full transition-colors ${tailing ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-700"}`}
      >
        <span
          className={`absolute h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${tailing ? "translate-x-3.5" : "translate-x-0.5"}`}
        />
      </button>
      <span className="pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/log-tooltip:opacity-100 dark:bg-white dark:text-neutral-900">
        {tailing ? "Tail mode on" : "Tail mode off"}
      </span>
    </span>
  );
  const lineLimitSelect = (
    <span className="group/log-tooltip relative inline-flex">
      <select
        aria-label="Log line limit"
        value={lineLimit}
        onChange={(event) => {
          const next = Number(event.target.value);
          setLineLimit(next);
          if (tailing) readSelected(selected, next);
        }}
        className="h-6 cursor-pointer rounded border border-neutral-200 bg-transparent px-1 text-[10px] text-neutral-600 outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        {[100, 200, 500, 1000].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/log-tooltip:opacity-100 dark:bg-white dark:text-neutral-900">
        Lines to show
      </span>
    </span>
  );

  const visibleSources = sources.filter(
    (item) => category === "All" || item.category === category,
  );
  const orderedSources = [...visibleSources].sort((left, right) =>
    (left.label || left.name).localeCompare(right.label || right.name),
  );
  const selectedItem = sources.find((item) => item.id === selected);
  const toolbar = (
    <div className="flex items-center gap-0.5">
      <span className="px-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
        Tail
      </span>
      {tailToggle}
      {lineLimitSelect}
      {toolButton("Refresh log", RefreshCw, () =>
        readSelected(selected, tailing ? lineLimit : 1000),
      )}
      {toolButton(
        copied ? "Copied" : "Copy log",
        copied ? Check : Clipboard,
        copyContent,
      )}
      {toolButton("Download log", Download, downloadContent)}
      {toolButton(
        "Wrap lines",
        WrapText,
        () => setWrap((value) => !value),
        wrap,
      )}
    </div>
  );
  return (
    <>
      {toolbarReady &&
        toolbarHostRef?.current &&
        createPortal(toolbar, toolbarHostRef.current)}
      <div className="grid min-h-0 h-full grid-cols-[13rem_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-r border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between pl-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Log files
            </span>
            <button
              type="button"
              title="Refresh logs"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              onClick={loadSources}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          {loading ? (
            <p className="px-2 py-4 text-xs text-neutral-500">Loading logs…</p>
          ) : orderedSources.length === 0 ? (
            <p className="px-2 py-4 text-xs text-neutral-500">No logs found.</p>
          ) : (
            orderedSources.map((item) => (
              <div
                key={item.id}
                className={`group relative flex w-full items-center px-2 py-1.5 text-xs ${selected === item.id ? "bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" : "text-neutral-600 dark:text-neutral-400"}`}
              >
                <button
                  type="button"
                  title={item.path}
                  className="flex min-w-0 w-full cursor-pointer items-center gap-2 text-left hover:text-neutral-900 dark:hover:text-neutral-100"
                  onClick={() => setSelected(item.id)}
                >
                  <FileText size={13} className="shrink-0" />
                  <span className="truncate">{item.label || item.name}</span>
                </button>
                <span className="absolute right-1 flex items-center gap-0.5 rounded bg-white/75 px-0.5 backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-neutral-900/75">
                  {toolButton(
                    "Clear log",
                    Eraser,
                    (event) => clearSource(event, item),
                    false,
                    true,
                  )}
                  {toolButton(
                    "Delete log",
                    Trash2,
                    (event) => deleteSource(event, item),
                    false,
                    true,
                  )}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col pl-1">
          <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  {selectedItem?.label || selectedItem?.name || "Log output"}
                </p>
                <p
                  className="truncate text-[10px] text-neutral-500"
                  title={selectedItem?.path || ""}
                >
                  {selectedItem?.path ||
                    "Select a log file to view its contents."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-right text-[10px] text-neutral-500 dark:text-neutral-400">
                <span>
                  <strong className="block font-semibold text-neutral-700 dark:text-neutral-300">
                    {formatBytes(selectedItem?.size || 0)}
                  </strong>
                  Size
                </span>
                <span>
                  <strong className="block font-semibold text-neutral-700 dark:text-neutral-300">
                    {formatModified(selectedItem?.modified)}
                  </strong>
                  Last modified
                </span>
                <span>
                  <strong className="block font-semibold text-neutral-700 dark:text-neutral-300">
                    {content ? content.split("\n").length : 0}
                  </strong>
                  Lines shown
                </span>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto pl-1">
            {reading ? (
              <p className="py-8 text-center text-xs text-neutral-500">
                Reading log…
              </p>
            ) : (
              <pre
                className={`${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"} font-mono text-[11px] leading-5 text-neutral-800 dark:text-neutral-300`}
              >
                {content || "No log entries recorded."}
              </pre>
            )}
          </div>
        </div>
      </div>
      <ActionDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onSubmit={() => confirmDialog?.onSubmit?.()}
      />
    </>
  );
}
