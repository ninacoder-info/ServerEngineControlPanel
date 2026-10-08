import React from "react";
import { RefreshCw, Settings2, Server } from "lucide-react";

export default function ServiceStoppedState({
  icon: Icon = Server,
  eyebrow = "Service stopped",
  title,
  description,
  onConfigure,
  configureLabel = "Configure",
  configuring = false,
  onCheck,
}) {
  return (
    <div className="flex min-h-[calc(100vh-18rem)] items-center justify-center border-t border-neutral-200 px-5 py-12 dark:border-neutral-800">
      <div className="max-w-lg text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
          <Icon size={23} />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          {eyebrow}
        </p>
        <h4 className="mt-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h4>
        <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onConfigure} disabled={configuring} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70">
            {configuring ? <RefreshCw size={15} className="animate-spin" /> : <Settings2 size={15} />}
            {configuring ? "Loading configuration…" : configureLabel}
          </button>
          <button type="button" onClick={onCheck} className="inline-flex cursor-pointer items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
            <RefreshCw size={15} />
            Check again
          </button>
        </div>
      </div>
    </div>
  );
}
