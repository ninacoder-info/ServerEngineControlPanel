import React from "react";

const icons = import.meta.glob("./*.svg", { eager: true, query: "?url", import: "default" });

export default function ServiceSvgIcon({ serviceId, size = 21, className = "" }) {
  const source = icons[`./${serviceId}.svg`];
  return source ? <img src={source} width={size} height={size} className={className} alt="" aria-hidden="true" /> : null;
}
