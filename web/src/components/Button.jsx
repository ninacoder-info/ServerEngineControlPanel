import React from "react";

const variants = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
  danger:
    "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30",
  ghost:
    "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
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
