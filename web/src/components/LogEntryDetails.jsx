import React from "react";
import { FileText, TerminalSquare } from "lucide-react";

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
        {children || "—"}
      </dd>
    </div>
  );
}

export default function LogEntryDetails({ row, service = false }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
        {service ? (
          <TerminalSquare size={17} className="text-blue-500" />
        ) : (
          <FileText size={17} className="text-blue-500" />
        )}
        <strong className="font-semibold">
          {service ? "Service log entry" : "Recorded event"}
        </strong>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <Detail label={service ? "Service" : "Actor"}>{row.user}</Detail>
        <Detail label={service ? "Log type" : "Event"}>{row.type}</Detail>
        <Detail label="Status">
          <span className="capitalize">{row.level}</span>
        </Detail>
        <Detail label={service ? "Line" : "Recorded"}>
          {service ? row.lineNumber?.toLocaleString() : row.time}
        </Detail>
      </dl>

      {service && (
        <div>
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            Source
          </p>
          <code className="block break-all rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {row.logPath || "—"}
          </code>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
          {service ? "Raw entry" : "Details"}
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-100 px-3 py-2 font-mono text-xs leading-5 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {row.detail || "No additional details recorded."}
        </pre>
      </div>

      {row.log?.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            Job output
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-slate-300">
            {row.log.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
