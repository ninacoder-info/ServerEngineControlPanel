import React from "react";

const variants = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
  danger:
    "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30",
  ghost:
    "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
};

export default function Button({
  variant = "secondary",
  iconOnly = false,
  className = "",
  type = "button",
  children,
  ...props
}) {
  const base = iconOnly
    ? "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full"
    : "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold";
  const resolvedVariant = iconOnly && variant === "secondary" ? "ghost" : variant;

  return (
    <button
      type={type}
      className={`${base} ${variants[resolvedVariant] || variants.secondary} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
