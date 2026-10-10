import React from "react";
import { Info } from "lucide-react";
import { formControlClass } from "./ui/form";

export { formControlClass };

export default function FormField({
  label,
  children,
  hint,
  tooltip,
  error,
  showError = true,
}) {
  const control =
    React.isValidElement(children) && children.type !== React.Fragment
      ? React.cloneElement(children, {
          className: formControlClass(
            children.props.className || "",
            Boolean(error),
          ),
          "aria-invalid": error ? "true" : undefined,
        })
      : children;
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      <span
        className={`inline-flex items-center gap-1.5 ${error ? "text-rose-600 dark:text-rose-400" : ""}`}
      >
        {label}
        {tooltip && (
          <span className="group/form-field-tooltip relative inline-flex cursor-help items-center text-neutral-400 dark:text-neutral-500">
            <Info
              size={14}
              aria-label={`${label} information`}
              title={tooltip}
            />
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-64 rounded-md bg-neutral-900 px-2.5 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition-opacity group-hover/form-field-tooltip:opacity-100 dark:bg-white dark:text-neutral-900">
              {tooltip}
            </span>
          </span>
        )}
      </span>
      {control}
      {hint && (
        <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
          {hint}
        </span>
      )}
      {showError && error && (
        <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </label>
  );
}
