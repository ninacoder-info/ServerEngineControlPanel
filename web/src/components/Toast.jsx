import React from "react";
import { AlertTriangle, CheckCircle2, X, XCircle } from "lucide-react";
import { toast as sonnerToast } from "sonner";

function ToastCard({ id, message, type }) {
  const success = type === "success";
  const warning = type === "warning";
  const Icon = success ? CheckCircle2 : warning ? AlertTriangle : XCircle;
  const iconClass = success
    ? "text-emerald-600 dark:text-emerald-400"
    : warning
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <div
      className="flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      role="status"
      aria-live="polite"
    >
      <Icon className={`mt-0.5 shrink-0 ${iconClass}`} size={18} />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        onClick={() => sonnerToast.dismiss(id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function Toast({ message, type = "success", onClose }) {
  const lastToast = React.useRef("");

  React.useEffect(() => {
    if (!message) {
      lastToast.current = "";
      return undefined;
    }

    const toastKey = `${type}:${message}`;
    if (lastToast.current === toastKey) return undefined;
    lastToast.current = toastKey;

    const id = sonnerToast.custom(
      (toastId) => (
        <ToastCard id={toastId} message={message} type={type} />
      ),
      {
        duration: 4500,
        onDismiss: onClose,
      },
    );
  }, [message, type]);

  return null;
}
