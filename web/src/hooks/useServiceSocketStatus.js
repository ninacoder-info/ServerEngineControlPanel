import React from "react";

/**
 * Keeps a service control surface synchronized with the authenticated jobs
 * socket. The command itself is still sent by the caller; this hook owns the
 * live status and action state after the command is queued.
 */
export default function useServiceSocketStatus(serviceId, initialStatus = "stopped") {
  const [status, setStatus] = React.useState(initialStatus || "stopped");
  const [action, setAction] = React.useState("");

  React.useEffect(() => {
    if (!action) setStatus(initialStatus || "stopped");
  }, [initialStatus]);

  React.useEffect(() => {
    const update = (event) => {
      const detail = event.detail || {};
      if (detail.serviceId !== serviceId) return;

      if (["queued", "running"].includes(detail.status)) {
        setAction(detail.action || "");
        return;
      }
      if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;

      if (detail.status === "succeeded") {
        if (["start", "restart"].includes(detail.action)) setStatus("running");
        if (detail.action === "stop") setStatus("stopped");
      }
      setAction("");
    };

    window.addEventListener("serverengine:service-status", update);
    return () => window.removeEventListener("serverengine:service-status", update);
  }, [serviceId]);

  return { status, action, setAction };
}
