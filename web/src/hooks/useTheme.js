import React from "react";
import {
  applyPanelPreferences,
  readPanelPreferences,
} from "../lib/panelPreferences";

function readLightPreference() {
  const panelTheme = readPanelPreferences().panel_theme;
  if (panelTheme === "light") return true;
  if (panelTheme === "dark") return false;
  if (panelTheme === "system") {
    return (
      window.matchMedia?.("(prefers-color-scheme: light)")?.matches ?? false
    );
  }
  return localStorage.getItem("server-engine-theme") === "light";
}

export function useTheme() {
  const [light, setLight] = React.useState(readLightPreference);
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", !light);
    document.documentElement.style.colorScheme = light ? "light" : "dark";
  }, [light]);
  React.useEffect(() => {
    const handlePanelSettings = () => setLight(readLightPreference());
    window.addEventListener(
      "serverengine:panel-settings-change",
      handlePanelSettings,
    );
    return () =>
      window.removeEventListener(
        "serverengine:panel-settings-change",
        handlePanelSettings,
      );
  }, []);
  function toggle() {
    const next = !light;
    setLight(next);
    // Keep the explicit toggle in the same preference store used during boot.
    // Otherwise a reload falls back to the old `system` setting.
    applyPanelPreferences({ panel_theme: next ? "light" : "dark" });
  }
  return { light, toggle };
}
