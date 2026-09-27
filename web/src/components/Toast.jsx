import React from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

export default function Toast({ message, type = "success", onClose }) {
  React.useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => onClose?.(), 4500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  const success = type === "success";
  return (
    <div
      className="fixed right-4 top-4 z-[100] flex max-w-sm items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      role="status"
      aria-live="polite"
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" size={18} />
      ) : (
        <XCircle className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" size={18} />
      )}
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}
