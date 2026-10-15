const STORAGE_KEY = "server-engine-panel-settings";

export function readPanelPreferences() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function applyPanelPreferences(values = {}) {
  const current = { ...readPanelPreferences(), ...values };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  if (current.panel_name) {
    localStorage.setItem("server-engine-panel-name", current.panel_name);
  }

  if (current.language) {
    localStorage.setItem("server-engine-language", current.language);
    document.documentElement.lang = current.language;
  }
  if (current.panel_theme && current.panel_theme !== "system") {
    localStorage.setItem(
      "server-engine-theme",
      current.panel_theme === "light" ? "light" : "dark",
    );
  } else if (current.panel_theme === "system") {
    localStorage.removeItem("server-engine-theme");
  }
  if (current.panel_density) {
    document.documentElement.dataset.density = current.panel_density;
  }
  if (typeof current.panel_show_hints === "boolean") {
    document.documentElement.dataset.showHints = String(
      current.panel_show_hints,
    );
  }
  if (current.panel_accent) {
    document.documentElement.dataset.accent = current.panel_accent;
  }

  window.dispatchEvent(
    new CustomEvent("serverengine:panel-settings-change", {
      detail: current,
    }),
  );
  if (current.language) {
    window.dispatchEvent(
      new CustomEvent("serverengine:language-change", {
        detail: { language: current.language },
      }),
    );
  }
  return current;
}

export function panelTimeZone() {
  return readPanelPreferences().timezone || undefined;
}

export function formatPanelDate(value, options = {}) {
  const settings = readPanelPreferences();
  const format = settings.panel_date_format || "local";
  const { relative, ...dateOptions } = options;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (relative ?? format === "relative") {
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const absolute = Math.abs(seconds);
    if (absolute < 60) return "just now";
    const unit = absolute < 3600 ? "minute" : absolute < 86400 ? "hour" : "day";
    const amount = Math.round(
      absolute / (unit === "minute" ? 60 : unit === "hour" ? 3600 : 86400),
    );
    return `${amount} ${unit}${amount === 1 ? "" : "s"} ${seconds < 0 ? "ago" : "from now"}`;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: format === "iso" ? "short" : "medium",
    timeStyle: "short",
    timeZone: settings.timezone || undefined,
    ...dateOptions,
  }).format(date);
}
