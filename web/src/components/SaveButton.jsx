import React from "react";
import { Check, Save } from "lucide-react";

export default function SaveButton({
  onClick,
  saving = false,
  disabled = false,
  children = "Save",
  savedLabel = "Saved",
  className = "bg-blue-600 text-white hover:bg-blue-700",
}) {
  const [saved, setSaved] = React.useState(false);
  const timer = React.useRef(null);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const submit = async () => {
    const result = await onClick?.();
    if (result === false) return;
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 5000);
  };

  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${className}`}
      disabled={saving || disabled}
      onClick={submit}
    >
      {saving ? (
        <span>Saving…</span>
      ) : saved ? (
        <Check size={15} />
      ) : (
        <Save size={15} />
      )}
      {saving ? "Saving…" : saved ? savedLabel : children}
    </button>
  );
}
