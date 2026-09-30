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
      const activeJob = jobs.find((job) => {
        const type = String(job.type || "").toLowerCase();
        return (job.status === "queued" || job.status === "running") && serviceIds.some((id) => type.includes(`install ${id.toLowerCase()}`));
      });
      setInstalled(services.some((item) => serviceIds.some((id) => isMatchingService(item, id))));
      setInstallJob(activeJob || null);
    } catch (statusError) {
      setInstalled(false);
      setInstallJob(null);
      setError(statusError.message || "Unable to check service status.");
    } finally {
      setLoading(false);
    }
  }, [serviceId, serviceIds]);

  React.useEffect(() => {
    loadStatus();
    const refresh = () => loadStatus();
    window.addEventListener("serverengine:jobs-updated", refresh);
    return () => window.removeEventListener("serverengine:jobs-updated", refresh);
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
