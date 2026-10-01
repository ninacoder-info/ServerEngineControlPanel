import { useEffect, useState } from "react";

export default function Brand() {
  const [version, setVersion] = useState(null);
  const [name, setName] = useState(
    () => localStorage.getItem("server-engine-panel-name") || "Server Engine",
  );

  useEffect(() => {
    let active = true;
    fetch("/api/v1/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.version) setVersion(data.version);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const updateName = (event) => {
      if (event.detail?.panel_name) {
        setName(event.detail.panel_name);
        localStorage.setItem("server-engine-panel-name", event.detail.panel_name);
      }
    };
    window.addEventListener("serverengine:panel-settings-change", updateName);
    return () => window.removeEventListener("serverengine:panel-settings-change", updateName);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <img
        src="/assets/server-engine-icon.png"
        alt="Server Engine"
        className="h-10 w-10 rounded-xl object-cover"
      />
      <div>
        <p className="font-semibold">{name}</p>
        <p className="text-xs text-slate-500">Version {version ? `v${version}` : "—"}</p>
      </div>
    </div>
  );
}
