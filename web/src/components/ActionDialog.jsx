import React from "react";
import { X } from "lucide-react";

export default function ActionDialog({ dialog, onClose, onSubmit }) {
  if (!dialog) return null;
  const close = () => {
    dialog.onCancel?.();
    onClose();
  };
  const form = dialog.kind === "form";
  const permissions = dialog.kind === "permissions";
  const danger =
    dialog.kind === "error" ||
    (dialog.kind === "confirm" && dialog.tone !== "primary");
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              id="action-dialog-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {dialog.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close dialog"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-6">
          {dialog.message && (
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {dialog.message}
            </p>
          )}
          {form && (
            <label className="mt-1 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {dialog.label}
              <input
                autoFocus
                value={dialog.value}
                placeholder={dialog.placeholder || ""}
                onChange={(event) => dialog.onChange(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" && onSubmit(dialog.value)
                }
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {dialog.hint && (
                <span className="mt-2 block text-xs font-normal text-slate-500 dark:text-slate-400">
                  {dialog.hint}
                </span>
              )}
            </label>
          )}
          {permissions && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Access permissions
                </span>
                <code className="rounded bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {dialog.mode}
                </code>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-[minmax(5rem,1fr)_repeat(3,minmax(4.5rem,1fr))] border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <span className="px-3 py-2">Role</span>
                  <span className="px-3 py-2 text-center">Read</span>
                  <span className="px-3 py-2 text-center">Write</span>
                  <span className="px-3 py-2 text-center">Execute</span>
                </div>
                {["Owner", "Group", "Others"].map((role, groupIndex) => (
                  <div
                    key={role}
                    className="grid grid-cols-[minmax(5rem,1fr)_repeat(3,minmax(4.5rem,1fr))] border-b border-slate-200 last:border-b-0 dark:border-slate-700"
                  >
                    <span className="px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {role}
                    </span>
                    {[4, 2, 1].map((bit) => {
                      const digit = Number.parseInt(
                        dialog.mode?.[groupIndex + 1] || "0",
                        8,
                      );
                      const active = Boolean(digit & bit);
                      return (
                        <label
                          key={bit}
                          className="m-1.5 flex cursor-pointer items-center justify-center rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => {
                              const digits = (dialog.mode || "0644")
                                .padStart(4, "0")
                                .split("");
                              const nextDigit = active ? digit - bit : digit + bit;
                              digits[groupIndex + 1] = String(nextDigit);
                              dialog.onModeChange(digits.join(""));
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900"
                          />
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              {dialog.hint && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {dialog.hint}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
          >
            {dialog.cancelLabel || "Cancel"}
          </button>
          {(form || permissions || dialog.kind === "confirm") && (
            <button
              type="button"
              onClick={() => onSubmit(dialog.value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${danger ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {dialog.submitLabel || (form ? "Continue" : "Confirm")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
