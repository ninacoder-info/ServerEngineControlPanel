import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { php } from "@codemirror/lang-php";
import { oneDark } from "@codemirror/theme-one-dark";
import React from "react";

function languageFor(path = "") {
  if (/\.json$/i.test(path)) return json();
  if (/\.php$/i.test(path)) return php();
  if (/\.(js|jsx|mjs|ts|tsx)$/i.test(path))
    return javascript({ jsx: true, typescript: /tsx?$/.test(path) });
  if (/\.html?$/i.test(path)) return html();
  if (/\.css$/i.test(path)) return css();
  return [];
}

export default function ConfigEditor({
  path,
  value,
  onChange,
  readOnly = false,
  height = "24rem",
}) {
  const [dark, setDark] = React.useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  React.useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <CodeMirror
      value={value}
      editable={!readOnly}
      height={height}
      theme={dark ? oneDark : undefined}
      extensions={[languageFor(path)]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: true,
      }}
    />
  );
}
