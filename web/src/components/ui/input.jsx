import React from "react";
import { formControlClass } from "./form";

export function Input({ className = "", invalid = false, ...props }) {
  return (
    <input
      data-slot="input"
      className={formControlClass(
        `w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-950 ${className}`,
        invalid,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export default Input;
