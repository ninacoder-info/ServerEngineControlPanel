import React from "react";
import { RefreshCw, Server } from "lucide-react";
import Toast from "./Toast";
import InstallServiceModal from "../features/services/InstallServiceModal";

export default function ServiceNotInstalledState({
  state,
  icon: Icon = Server,
  eyebrow,
  title,
  description,
  installLabel,
  compact = false,
}) {
  if (state.loading) {
    return (
      <div className={`${compact ? "py-14" : "min-h-[calc(100vh-12rem)]"} flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400`}>
        Checking service status…
      </div>
    );
  }

  return (
    <>
      <Toast message={state.error} type="error" onClose={() => state.setError("")} />
      <div className={`${compact ? "py-14" : "min-h-[calc(100vh-12rem)]"} flex items-center justify-center`}>
        <section className={`${compact ? "w-full max-w-xl text-center" : "w-full max-w-xl rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900"}`}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <Icon size={26} />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">{state.installing ? `${title.replace(" is not installed", "")} installation in progress` : title}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-500 dark:text-neutral-400">{state.installing ? state.installJob?.message || "The installation job is queued and will continue in the background." : description}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {state.installing ? <span className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><RefreshCw size={15} className="animate-spin" />Installing…</span> : <button type="button" onClick={state.openInstaller} disabled={state.openingInstaller} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"><Icon size={15} />{state.openingInstaller ? "Loading installer…" : installLabel}</button>}
            <button type="button" onClick={state.loadStatus} className="inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
              <RefreshCw size={15} />
              Check again
            </button>
          </div>
        </section>
      </div>
      {state.service && !state.installing && <InstallServiceModal service={state.service} onClose={state.closeInstaller} />}
    </>
  );
}
