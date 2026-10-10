import React from "react";
import {
  Activity,
  FileCode2,
  FileText,
  Gauge,
  Image,
  Layers3,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const STORAGE_KEY = "serverengine:imagemagick";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["configuration", "Configuration", SlidersHorizontal],
  ["security", "Security", ShieldCheck],
  ["resources", "Resources", Gauge],
  ["formats", "Formats", Layers3],
  ["delegates", "Delegates", FileCode2],
  ["logs", "Error log", FileText],
];

const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  tempPath: "/opt/server-engine/tmp/imagemagick",
  quality: "85",
  thumbnailWidth: "1600",
  memory: "512 MiB",
  map: "1 GiB",
  disk: "2 GiB",
  area: "100 MP",
  width: "10000 px",
  height: "10000 px",
  listLength: "1000",
  time: "120 seconds",
  threads: "Auto",
  webSafe: true,
  stripMetadata: true,
  blockRemote: true,
  blockIndirect: true,
  disableFilters: true,
  jpeg: true,
  png: true,
  webp: true,
  gif: true,
  svg: true,
  tiff: true,
  pdf: false,
  ps: false,
  mvg: false,
  ghostscript: false,
  heic: false,
  raw: false,
  video: false,
};

function readSettings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"),
    };
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
          {hint}
        </span>
      )}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
      />
      <span>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-800">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="max-w-[72%] break-all text-right font-medium text-neutral-900 dark:text-neutral-100">
        {value || "—"}
      </span>
    </div>
  );
}

function SaveFooter({ onSave, saving }) {
  return (
    <div className="flex justify-end border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <SaveButton onClick={onSave} saving={saving}>
        Save changes
      </SaveButton>
    </div>
  );
}

export default function ImageMagickConfigModal({
  service,
  installed,
  onClose,
}) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("runtime");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root =
    current?.root || current?.path || "/opt/server-engine/services/imagemagick";
  const set = (key, value) =>
    setSettings((valueState) => ({ ...valueState, [key]: value }));

  const save = async (message = "ImageMagick settings saved.") => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message });
    return true;
  };

  const renderTab = () => {
    if (tab === "configuration") {
      return (
        <div className="space-y-6">
          <Section
            title="Image processing defaults"
            description="Set predictable defaults for image uploads, thumbnails, and optimized web output."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Temporary directory"
                hint="Use a dedicated writable directory with enough working space."
              >
                <input
                  className={`${inputClass} font-mono text-xs`}
                  value={settings.tempPath}
                  onChange={(event) => set("tempPath", event.target.value)}
                />
              </Field>
              <Field
                label="Default JPEG/WebP quality"
                hint="Applications can override this per conversion."
              >
                <select
                  className={inputClass}
                  value={settings.quality}
                  onChange={(event) => set("quality", event.target.value)}
                >
                  {["75", "80", "85", "90", "95"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Thumbnail width"
                hint="A safe default for profile, admin, and listing images."
              >
                <select
                  className={inputClass}
                  value={settings.thumbnailWidth}
                  onChange={(event) =>
                    set("thumbnailWidth", event.target.value)
                  }
                >
                  {["800", "1200", "1600", "2400", "4000"].map((value) => (
                    <option key={value} value={value}>
                      {value} px
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Metadata handling">
                <select
                  className={inputClass}
                  value={settings.stripMetadata ? "strip" : "preserve"}
                  onChange={(event) =>
                    set("stripMetadata", event.target.value === "strip")
                  }
                >
                  <option value="strip">Strip metadata by default</option>
                  <option value="preserve">Preserve metadata</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section
            title="Managed paths"
            description="These paths are owned by the Server Engine service area."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Installation root" value={root} />
              <Row
                label="Policy file"
                value={`${root}/etc/ImageMagick-7/policy.xml`}
              />
              <Row label="Binary" value={`${root}/bin/magick`} />
              <Row label="Error log" value={`${root}/logs/error.log`} />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "security") {
      return (
        <div className="space-y-6">
          <Section
            title="Safe web processing"
            description="These defaults reduce the risk of image conversion being used to read files or invoke external programs."
          >
            <div className="space-y-3">
              <Toggle
                label="Web-safe policy"
                description="Use conservative coder and delegate rules for hosted websites."
                checked={settings.webSafe}
                onChange={(value) => set("webSafe", value)}
              />
              <Toggle
                label="Block remote reads"
                description="Do not allow image URLs to trigger outbound network requests."
                checked={settings.blockRemote}
                onChange={(value) => set("blockRemote", value)}
              />
              <Toggle
                label="Block indirect reads"
                description="Reject @file and other indirect input references."
                checked={settings.blockIndirect}
                onChange={(value) => set("blockIndirect", value)}
              />
              <Toggle
                label="Disable image filters"
                description="Prevent filter expressions from executing arbitrary processing logic."
                checked={settings.disableFilters}
                onChange={(value) => set("disableFilters", value)}
              />
              <Toggle
                label="Strip metadata"
                description="Remove EXIF, GPS, and application metadata from generated files."
                checked={settings.stripMetadata}
                onChange={(value) => set("stripMetadata", value)}
              />
            </div>
          </Section>
          <Section
            title="High-risk coders"
            description="Document and vector coders can invoke delegates or expose more attack surface. Enable them only when a site needs them."
          >
            <div className="space-y-3">
              <Toggle
                label="PDF / PostScript"
                description="Allow PDF, PS, and EPS conversion through a configured delegate."
                checked={settings.pdf || settings.ps}
                onChange={(value) => {
                  set("pdf", value);
                  set("ps", value);
                }}
              />
              <Toggle
                label="MVG / MSL"
                description="Allow ImageMagick scripting formats. Disabled by default for hosted websites."
                checked={settings.mvg}
                onChange={(value) => set("mvg", value)}
              />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "resources") {
      const fields = [
        ["Memory", "memory", ["256 MiB", "512 MiB", "1 GiB", "2 GiB"]],
        ["Memory map", "map", ["512 MiB", "1 GiB", "2 GiB"]],
        ["Disk", "disk", ["1 GiB", "2 GiB", "5 GiB", "10 GiB"]],
        ["Pixel area", "area", ["25 MP", "100 MP", "250 MP", "500 MP"]],
        ["Maximum width", "width", ["4000 px", "10000 px", "20000 px"]],
        ["Maximum height", "height", ["4000 px", "10000 px", "20000 px"]],
        ["List length", "listLength", ["500", "1000", "5000"]],
        ["Time limit", "time", ["30 seconds", "120 seconds", "300 seconds"]],
        ["Worker threads", "threads", ["Auto", "1", "2", "4", "8"]],
      ];
      return (
        <div className="space-y-6">
          <Section
            title="Conversion limits"
            description="Limit the work a single request can allocate. This protects the panel and hosted websites from oversized or decompression-bomb images."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map(([label, key, options]) => (
                <Field key={key} label={label}>
                  <select
                    className={inputClass}
                    value={settings[key]}
                    onChange={(event) => set(key, event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "formats") {
      const formats = [
        ["jpeg", "JPEG", "Photographs and uploads"],
        ["png", "PNG", "Transparency and screenshots"],
        ["webp", "WebP", "Modern web delivery"],
        ["gif", "GIF", "Legacy animation and images"],
        ["svg", "SVG", "Trusted vector assets"],
        ["tiff", "TIFF", "High-quality source images"],
        ["pdf", "PDF", "Document conversion"],
        ["ps", "PS / EPS", "PostScript documents"],
      ];
      return (
        <div className="space-y-6">
          <Section
            title="Allowed image formats"
            description="Only enabled coders are accepted by the managed policy. PDF and PostScript remain off unless explicitly enabled."
          >
            <div className="space-y-3">
              {formats.map(([key, label, description]) => (
                <Toggle
                  key={key}
                  label={label}
                  description={description}
                  checked={settings[key]}
                  onChange={(value) => set(key, value)}
                />
              ))}
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "delegates") {
      const delegates = [
        ["ghostscript", "Ghostscript", "PDF, PS, and EPS rendering", "danger"],
        [
          "heic",
          "HEIC / HEIF",
          "Apple and modern phone image support",
          "normal",
        ],
        [
          "raw",
          "RAW camera formats",
          "Camera vendor formats through delegates",
          "normal",
        ],
        ["video", "Video frames", "FFmpeg-backed frame extraction", "normal"],
      ];
      return (
        <div className="space-y-6">
          <Section
            title="External delegates"
            description="Delegates add capabilities outside the core ImageMagick binary. Keep them disabled unless a website requires them."
          >
            <div className="space-y-3">
              {delegates.map(([key, label, description, risk]) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 last:border-0 dark:border-neutral-800"
                >
                  <Toggle
                    label={label}
                    description={description}
                    checked={settings[key]}
                    onChange={(value) => set(key, value)}
                  />
                  {risk === "danger" && (
                    <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Review policy
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "runtime") {
      return (
        <div className="space-y-6">
          <Section
            title="Runtime status"
            description="ImageMagick is a command-line conversion runtime, not a background daemon. It runs when a website or job invokes it."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Status" value="Installed" />
              <Row label="Version" value={version} />
              <Row label="magick" value={`${root}/bin/magick`} />
              <Row label="identify" value={`${root}/bin/identify`} />
              <Row label="Policy" value="Managed policy.xml" />
            </div>
          </Section>
          <Section
            title="Verification commands"
            description="Run these from the Server Engine terminal to inspect the active policy and resource limits."
          >
            <div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200">
              <p>{root}/bin/magick -version</p>
              <p>{root}/bin/magick identify -list policy</p>
              <p>{root}/bin/magick identify -list resource</p>
            </div>
          </Section>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Section
          title="ImageMagick error log"
          description="Conversion failures, denied coders, delegate errors, and resource-limit events appear here."
        >
          <div className="border-y border-neutral-200 dark:border-neutral-800">
            <Row label="Log file" value={`${root}/logs/error.log`} />
            <Row label="Tail" value="50 lines" />
            <Row
              label="Live streaming"
              value="Available when the host agent is connected"
            />
          </div>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
            No ImageMagick errors have been reported yet.
          </div>
        </Section>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="imagemagick-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Image size={19} className="text-blue-600 dark:text-blue-400" />
              <h2
                id="imagemagick-title"
                className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
              >
                ImageMagick
              </h2>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Installed · v{version}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close ImageMagick configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-5 overflow-x-auto border-b border-neutral-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="px-6 py-5">{renderTab()}</div>
      </section>
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
