import React from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";

export default function FloatingTooltip({
  content,
  children,
  placement = "top",
  className = "",
}) {
  const [open, setOpen] = React.useState(false);
  const tooltipId = React.useId();
  const { refs, floatingStyles } = useFloating({
    open,
    placement,
    strategy: "fixed",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  if (!content) return children;

  const child = React.Children.only(children);
  const trigger = React.isValidElement(child)
    ? React.cloneElement(child, {
        "aria-describedby": tooltipId,
      })
    : child;

  return (
    <span
      ref={refs.setReference}
      className={className || "inline-flex"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {trigger}
      {open && (
        <FloatingPortal>
          <span
            id={tooltipId}
            ref={refs.setFloating}
            role="tooltip"
            style={{ ...floatingStyles, zIndex: 10001 }}
            className="pointer-events-none max-w-[min(20rem,calc(100vw-1rem))] rounded-md bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium leading-4 text-white shadow-lg dark:bg-white dark:text-neutral-900"
          >
            {content}
          </span>
        </FloatingPortal>
      )}
    </span>
  );
}
