import CodeMirror from "@uiw/react-codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { bracketMatching, foldGutter, indentUnit } from "@codemirror/language";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { php } from "@codemirror/lang-php";
import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, highlightActiveLine, lineNumbers } from "@codemirror/view";
import {
  Braces,
  ChevronsDown,
  FoldHorizontal,
  FoldVertical,
  IndentIncrease,
  ListOrdered,
  Minus,
  Plus,
  Search,
  WrapText,
} from "lucide-react";
import React from "react";
import FloatingTooltip from "../../components/FloatingTooltip";

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
  const editorView = React.useRef(null);
  const [wrapText, setWrapText] = React.useState(false);
  const [showLineNumbers, setShowLineNumbers] = React.useState(true);
  const [showFolding, setShowFolding] = React.useState(true);
  const [highlightLine, setHighlightLine] = React.useState(true);
  const [matchBrackets, setMatchBrackets] = React.useState(true);
  const [enableAutocomplete, setEnableAutocomplete] = React.useState(true);
  const [fontSize, setFontSize] = React.useState(14);
  const [tabSize, setTabSize] = React.useState(4);
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

  const toggleButton = (label, icon, pressed, onClick) => (
    <FloatingTooltip content={label}>
      <button
        type="button"
        className={`file-toolbar-button inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${pressed ? "text-blue-600 dark:text-blue-400" : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {icon}
      </button>
    </FloatingTooltip>
  );

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-end gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 py-1 dark:border-neutral-800 dark:bg-neutral-950">
        {toggleButton(
          wrapText ? "Disable text wrapping" : "Wrap long lines",
          <WrapText size={14} />,
          wrapText,
          () => setWrapText((enabled) => !enabled),
        )}
        {toggleButton(
          showLineNumbers ? "Hide line numbers" : "Show line numbers",
          <ListOrdered size={14} />,
          showLineNumbers,
          () => setShowLineNumbers((enabled) => !enabled),
        )}
        {toggleButton(
          showFolding ? "Hide code folding" : "Show code folding",
          showFolding ? (
            <FoldVertical size={14} />
          ) : (
            <FoldHorizontal size={14} />
          ),
          showFolding,
          () => setShowFolding((enabled) => !enabled),
        )}
        {toggleButton(
          highlightLine ? "Disable active line" : "Highlight active line",
          <span className="h-3 w-3 rounded-sm border-2 border-current" />,
          highlightLine,
          () => setHighlightLine((enabled) => !enabled),
        )}
        {toggleButton(
          matchBrackets ? "Disable bracket matching" : "Match brackets",
          <Braces size={14} />,
          matchBrackets,
          () => setMatchBrackets((enabled) => !enabled),
        )}
        {toggleButton(
          enableAutocomplete ? "Disable autocomplete" : "Enable autocomplete",
          <ChevronsDown size={14} />,
          enableAutocomplete,
          () => setEnableAutocomplete((enabled) => !enabled),
        )}
        <span className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
        <FloatingTooltip content="Find and replace">
          <button
            type="button"
            className="file-toolbar-button inline-flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
            aria-label="Find and replace"
            onClick={() =>
              editorView.current && openSearchPanel(editorView.current)
            }
          >
            <Search size={14} />
          </button>
        </FloatingTooltip>
        <FloatingTooltip content="Decrease font size">
          <button
            type="button"
            className="file-toolbar-button inline-flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
            aria-label="Decrease font size"
            disabled={fontSize <= 10}
            onClick={() => setFontSize((size) => Math.max(10, size - 1))}
          >
            <Minus size={14} />
          </button>
        </FloatingTooltip>
        <FloatingTooltip content="Increase font size">
          <button
            type="button"
            className="file-toolbar-button inline-flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
            aria-label="Increase font size"
            disabled={fontSize >= 24}
            onClick={() => setFontSize((size) => Math.min(24, size + 1))}
          >
            <Plus size={14} />
          </button>
        </FloatingTooltip>
        <FloatingTooltip content={`Indent size: ${tabSize} spaces`}>
          <button
            type="button"
            className="file-toolbar-button inline-flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
            aria-label={`Indent size: ${tabSize} spaces`}
            onClick={() =>
              setTabSize((size) => (size === 2 ? 4 : size === 4 ? 8 : 2))
            }
          >
            <IndentIncrease size={14} />
          </button>
        </FloatingTooltip>
      </div>
      <div style={{ fontSize: `${fontSize}px` }}>
        <CodeMirror
          value={value}
          editable={!readOnly}
          height={height}
          theme={dark ? oneDark : undefined}
          extensions={[
            languageFor(path),
            EditorState.tabSize.of(tabSize),
            indentUnit.of(" ".repeat(tabSize)),
            ...(wrapText ? [EditorView.lineWrapping] : []),
            ...(showLineNumbers ? [lineNumbers()] : []),
            ...(showFolding ? [foldGutter()] : []),
            ...(highlightLine ? [highlightActiveLine()] : []),
            ...(matchBrackets ? [bracketMatching()] : []),
            ...(enableAutocomplete ? [autocompletion()] : []),
          ]}
          onChange={onChange}
          onCreateEditor={(view) => {
            editorView.current = view;
          }}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            bracketMatching: false,
            autocompletion: false,
          }}
        />
      </div>
    </div>
  );
}
