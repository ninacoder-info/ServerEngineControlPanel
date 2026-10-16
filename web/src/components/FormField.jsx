import React from "react";
import { Info } from "lucide-react";
import { formControlClass } from "./ui/form";
import FloatingTooltip from "./FloatingTooltip";

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
          <FloatingTooltip content={tooltip} placement="bottom-start">
            <span className="cursor-help items-center text-neutral-400 dark:text-neutral-500">
              <Info size={14} aria-label={`${label} information`} />
            </span>
          </FloatingTooltip>
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
