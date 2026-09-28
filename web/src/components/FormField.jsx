import React from "react";
import { formControlClass } from "./ui/form";

export { formControlClass };

export default function FormField({ label, children, hint, error }) {
  const control = React.isValidElement(children) && children.type !== React.Fragment
    ? React.cloneElement(children, { className: formControlClass(children.props.className || "", Boolean(error)), "aria-invalid": error ? "true" : undefined })
    : children;
  return <label className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span className={error ? "text-rose-600 dark:text-rose-400" : ""}>{label}</span>{control}{hint && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">{hint}</span>}{error && <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{error}</span>}</label>;
}
