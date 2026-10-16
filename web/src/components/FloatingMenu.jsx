import React from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";

export default function FloatingMenu({
  open,
  anchorRef,
  children,
  className = "",
  placement = "bottom-end",
}) {
  const { refs, floatingStyles } = useFloating({
    open,
    placement,
    strategy: "fixed",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  React.useLayoutEffect(() => {
    refs.setReference(anchorRef.current);
  }, [anchorRef, open, refs]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, zIndex: 10000 }}
        className={className}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}
