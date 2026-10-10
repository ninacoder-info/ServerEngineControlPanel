import React from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { generateSecurePassword } from "../lib/passwords";

const iconButton =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";

const SecurePasswordInput = React.forwardRef(function SecurePasswordInput(
  {
    className = "",
    value = "",
    onChange,
    showGenerator = true,
    autoComplete = "new-password",
    ...props
  },
  ref,
) {
  const [visible, setVisible] = React.useState(false);
  const setValue = (next) => onChange?.({ target: { value: next } });
  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        value={value}
        onChange={onChange}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        className={`${className} ${showGenerator ? "pr-20" : "pr-12"}`}
      />
      <div className="absolute inset-y-1 right-1 flex items-center gap-0.5">
        <button
          type="button"
          className={iconButton}
          onClick={() => setVisible((current) => !current)}
          title={visible ? "Hide password" : "Show password"}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        {showGenerator && (
          <button
            type="button"
            className={iconButton}
            onClick={() => setValue(generateSecurePassword())}
            title="Generate secure password"
            aria-label="Generate secure password"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
    </div>
  );
});

export default SecurePasswordInput;
