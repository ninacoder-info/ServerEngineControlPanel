import React from "react";
import { FileText, TerminalSquare } from "lucide-react";

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="mt-1 font-medium text-neutral-800 dark:text-neutral-200">
        {children || "—"}
      </dd>
    </div>
  );
}

export default function LogEntryDetails({ row, service = false }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
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
          <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
            Source
          </p>
          <code className="block break-all rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            {row.logPath || "—"}
          </code>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
          {service ? "Raw entry" : "Details"}
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-100 px-3 py-2 font-mono text-xs leading-5 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          {row.detail || "No additional details recorded."}
        </pre>
      </div>

      {row.log?.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
            Job output
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-950 px-3 py-2 font-mono text-xs leading-5 text-neutral-300">
            {row.log.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
