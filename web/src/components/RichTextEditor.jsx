import React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eye,
  EyeOff,
  Eraser,
  Italic,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

const iconTools = [
  ["bold", "Bold", Bold],
  ["italic", "Italic", Italic],
  ["underline", "Underline", Underline],
  ["insertUnorderedList", "Bulleted list", List],
  ["insertOrderedList", "Numbered list", ListOrdered],
  ["justifyLeft", "Align left", AlignLeft],
  ["justifyCenter", "Align center", AlignCenter],
  ["justifyRight", "Align right", AlignRight],
  ["formatBlock:blockquote", "Quote", Quote],
  ["formatBlock:pre", "Code block", Code2],
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "We'll be back shortly.",
}) {
  const editor = React.useRef(null);
  const [preview, setPreview] = React.useState(false);

  React.useEffect(() => {
    if (editor.current && editor.current.innerHTML !== (value || ""))
      editor.current.innerHTML = value || "";
  }, [value]);

  const emit = () => onChange(editor.current?.innerHTML || "");
  const command = (rawCommand, argument) => {
    editor.current?.focus();
    const [name, format] = rawCommand.split(":");
    document.execCommand(name, false, format || argument);
    emit();
  };
  const addLink = () => {
    const url = window.prompt("Link URL");
    if (url) command("createLink", url);
  };
  const buttonClass =
    "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-600 hover:bg-white hover:text-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-blue-400";

  return (
    <div className="mt-1.5 overflow-hidden rounded-md border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-50 p-1.5 dark:border-neutral-800 dark:bg-neutral-900">
        <select
          aria-label="Text style"
          title="Text style"
          defaultValue="p"
          onChange={(event) => command("formatBlock", event.target.value)}
          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <span className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
        {iconTools.map(([name, label, Icon]) => (
          <button
            key={name}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(name)}
            className={buttonClass}
          >
            <Icon size={15} />
          </button>
        ))}
        <button
          type="button"
          title="Add link"
          aria-label="Add link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addLink}
          className={buttonClass}
        >
          <Link size={15} />
        </button>
        <button
          type="button"
          title="Remove link"
          aria-label="Remove link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("unlink")}
          className={buttonClass}
        >
          <Link2Off size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("undo")}
          className={buttonClass}
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("redo")}
          className={buttonClass}
        >
          <Redo2 size={15} />
        </button>
        <button
          type="button"
          title="Clear formatting"
          aria-label="Clear formatting"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("removeFormat")}
          className={buttonClass}
        >
          <Eraser size={15} />
        </button>
        <span className="ml-auto h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
        <button
          type="button"
          title={preview ? "Edit message" : "Preview message"}
          aria-label={preview ? "Edit message" : "Preview message"}
          onClick={() => setPreview((current) => !current)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-neutral-600 hover:bg-white hover:text-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-blue-400"
        >
          {preview ? <EyeOff size={15} /> : <Eye size={15} />}
          {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {preview ? (
        <div
          className="prose prose-sm min-h-32 max-w-none px-3 py-3 text-neutral-900 dark:prose-invert dark:text-neutral-100"
          dangerouslySetInnerHTML={{ __html: value || `<p>${placeholder}</p>` }}
        />
      ) : (
        <div
          ref={editor}
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          suppressContentEditableWarning
          onInput={emit}
          className="min-h-32 w-full bg-transparent px-3 py-3 text-sm text-neutral-900 outline-none empty:before:pointer-events-none empty:before:text-neutral-400 empty:before:content-[attr(data-placeholder)] dark:text-neutral-100"
        />
      )}
    </div>
  );
}
