import React from "react";
import { apiRequest, readApiError } from "../lib/api";

function isMatchingService(service, serviceId) {
  return service?.id === serviceId || service?.id?.startsWith(`${serviceId}@`);
}

export function useServiceInstallationState(serviceId) {
  const serviceIds = React.useMemo(
    () => (Array.isArray(serviceId) ? serviceId : [serviceId]),
    [serviceId],
  );
  const installerId = serviceIds[0];
  const [installed, setInstalled] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [service, setService] = React.useState(null);
  const [openingInstaller, setOpeningInstaller] = React.useState(false);
  const [installJob, setInstallJob] = React.useState(null);
  const [error, setError] = React.useState("");

  const loadStatus = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, jobsResponse] = await Promise.all([
        apiRequest("/api/v1/services/installed"),
        apiRequest("/api/v1/jobs"),
      ]);
      if (!response.ok) throw new Error(await readApiError(response, "Unable to check service status."));
      const services = await response.json();
      const jobs = jobsResponse.ok ? await jobsResponse.json() : [];
      const matchingServices = services.filter((item) => serviceIds.some((id) => isMatchingService(item, id)));
      const activeJob = jobs.find((job) => {
        const type = String(job.type || "").toLowerCase();
        return (job.status === "queued" || job.status === "running") && serviceIds.some((id) => type.includes(`install ${id.toLowerCase()}`));
      });
      setInstalled(matchingServices.length > 0);
      setRunning(matchingServices.some((item) => item.running === true || item.status === "running"));
      setInstallJob(activeJob || null);
    } catch (statusError) {
      setInstalled(false);
      setRunning(false);
      setInstallJob(null);
      setError(statusError.message || "Unable to check service status.");
    } finally {
      setLoading(false);
    }
  }, [serviceId, serviceIds]);

  React.useEffect(() => {
    loadStatus();
    const updateFromSocket = (event) => {
      const detail = event.detail || {};
      if (!serviceIds.some((id) => detail.serviceId === id || detail.serviceId?.startsWith(`${id}@`))) return;
      if (["queued", "running"].includes(detail.status)) {
        if (detail.action === "install") setInstallJob(detail.job || { status: detail.status });
        return;
      }
      if (detail.status !== "succeeded") return;
      if (detail.action === "install") {
        setInstalled(true);
        setRunning(false);
        setInstallJob(null);
      } else if (detail.action === "uninstall") {
        setInstalled(false);
        setRunning(false);
        setInstallJob(null);
      } else if (["stop", "start", "restart"].includes(detail.action)) {
        setRunning(detail.action !== "stop");
        setInstallJob(null);
      }
    };
    window.addEventListener("serverengine:service-status", updateFromSocket);
    return () => window.removeEventListener("serverengine:service-status", updateFromSocket);
  }, [loadStatus]);

  const openInstaller = React.useCallback(async () => {
    if (openingInstaller) return;
    setOpeningInstaller(true);
    setError("");
    try {
      const response = await apiRequest("/api/v1/services/catalog");
      if (!response.ok) throw new Error(await readApiError(response, "Unable to load the service installer."));
      const services = await response.json();
      const catalogService = services.find((item) => item.id === installerId);
      if (!catalogService) throw new Error(`${installerId} is not available in the service catalog.`);
      setService(catalogService);
    } catch (installerError) {
      setError(installerError.message || "Unable to load the service installer.");
    } finally {
      setOpeningInstaller(false);
    }
  }, [installerId, openingInstaller]);

  return {
    installed,
    running,
    loading,
    service,
    openingInstaller,
    installing: Boolean(installJob),
    installJob,
    error,
    setError,
    loadStatus,
    openInstaller,
    closeInstaller: () => setService(null),
  };
}
