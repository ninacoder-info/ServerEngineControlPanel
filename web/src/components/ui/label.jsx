import React from "react";

export function Label({ className = "", ...props }) {
  return <label className={`flex items-center gap-2 text-sm font-medium select-none ${className}`} {...props} />;
}

export default Label;
