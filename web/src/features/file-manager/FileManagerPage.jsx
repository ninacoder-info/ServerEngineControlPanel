import React from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  ClipboardPaste,
  CornerLeftUp,
  Copy,
  Download,
  Edit3,
  File,
  FileArchive,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Image,
  LockKeyhole,
  Maximize2,
  Minimize2,
  MoreVertical,
  Scissors,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Tree } from "react-arborist";
import { flip, offset, shift, useFloating } from "@floating-ui/react";
import SimpleBar from "simplebar-react";
import ActionDialog from "../../components/ActionDialog";
import FloatingTooltip from "../../components/FloatingTooltip";
import Toast from "../../components/Toast";
import ConfigEditor from "../services/ConfigEditor";
import { apiRequest as requestApi, readApiError } from "../../lib/api";

const formatBytes = (value) => {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
};

const formatRelativeTime = (timestamp) => {
  const modifiedAt = Number(timestamp) * 1000;
  if (!Number.isFinite(modifiedAt)) return "—";

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - modifiedAt) / 1000),
  );
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"}`;
  }

  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `${elapsedYears} year${elapsedYears === 1 ? "" : "s"}`;
};

const formatFullTime = (timestamp) => {
  const modifiedAt = Number(timestamp) * 1000;
  return Number.isFinite(modifiedAt)
    ? new Date(modifiedAt).toLocaleString()
    : "Unknown modification time";
};

function readDroppedEntry(entry, parentPath = "") {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file(
        (file) =>
          resolve([{ file, relativePath: `${parentPath}${file.name}` }]),
        reject,
      );
    });
  }
  if (!entry.isDirectory) return Promise.resolve([]);

  const reader = entry.createReader();
  const readBatch = () =>
    new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  return (async () => {
    const files = [];
    let entries = [];
    do {
      entries = await readBatch();
      for (const child of entries) {
        files.push(
          ...(await readDroppedEntry(child, `${parentPath}${entry.name}/`)),
        );
      }
    } while (entries.length);
    return files;
  })();
}

const EDITABLE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cjs",
  "conf",
  "cpp",
  "css",
  "env",
  "go",
  "h",
  "hpp",
  "htaccess",
  "htm",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "less",
  "lock",
  "log",
  "mjs",
  "md",
  "php",
  "phtml",
  "properties",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);
const EDITABLE_FILENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.example",
  ".gitignore",
  ".htaccess",
  "Dockerfile",
  "Makefile",
  "README",
  "README.md",
]);
function isEditableFile(name = "") {
  const lowerName = name.toLowerCase();
  const extension = lowerName.includes(".")
    ? lowerName.split(".").pop()
    : lowerName;
  return EDITABLE_FILENAMES.has(name) || EDITABLE_EXTENSIONS.has(extension);
}

function fileIcon(name) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "php",
      "py",
      "rb",
      "go",
      "rs",
      "css",
      "html",
    ].includes(extension)
  )
    return FileCode2;
  if (["json", "yaml", "yml", "toml", "xml"].includes(extension))
    return FileJson;
  if (["zip", "tar", "gz", "bz2", "7z", "rar"].includes(extension))
    return FileArchive;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(extension))
    return Image;
  return FileText;
}

function fileExtension(name = "") {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1
    ? name.slice(dot + 1).toUpperCase()
    : "—";
}

function TreeNode({ node, style }) {
  const folder = node.data.kind === "folder";
  const depth = Number(node.level || 0);
  const Icon = folder
    ? node.isOpen
      ? FolderOpen
      : Folder
    : fileIcon(node.data.name);
  return (
    <div
      className={`group relative flex min-h-8 w-full cursor-pointer items-center rounded-lg pr-2 text-sm transition-colors duration-200 ease-out hover:bg-neutral-100 dark:hover:bg-neutral-800/70 ${node.isSelected ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300" : "text-neutral-600 dark:text-neutral-300"}`}
      style={style}
      onClick={() => {
        node.select();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (folder && !node.isOpen) node.open();
      }}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {Array.from({ length: depth }).map((_, index) => (
          <span
            key={index}
            className="-ml-2 h-8 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700"
            aria-hidden="true"
          />
        ))}
        <button
          type="button"
          className="grid h-7 w-5 shrink-0 cursor-pointer place-items-center rounded-md text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          aria-label={
            folder
              ? `${node.isOpen ? "Collapse" : "Expand"} ${node.data.name}`
              : undefined
          }
          aria-expanded={folder ? node.isOpen : undefined}
          tabIndex={folder ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            if (folder) node.toggle();
          }}
        >
          {folder && (
            <ChevronRight
              size={15}
              className={`transition-transform duration-200 ease-out ${node.isOpen ? "rotate-90" : ""}`}
            />
          )}
        </button>
        <Icon
          size={16}
          className={
            folder
              ? node.isSelected
                ? "fill-blue-600 text-blue-600 dark:fill-blue-300 dark:text-blue-300"
                : "fill-blue-500 text-blue-500 dark:fill-blue-300 dark:text-blue-300"
              : "text-neutral-400 dark:text-neutral-500"
          }
        />
        <span className="min-w-0 truncate font-medium">{node.data.name}</span>
      </div>
    </div>
  );
}

export function FileManagerWorkspace({
  embedded = false,
  initialPath = "",
  containerId = "",
} = {}) {
  const fileManagerBase = containerId
    ? `/api/v1/services/docker/containers/${encodeURIComponent(containerId)}/files`
    : "/api/v1/file-manager";
  const apiRequest = React.useCallback(
    (url, options) => {
      const path = containerId ? url.replace("/api/v1/file-manager", "") : url;
      return requestApi(
        containerId ? `${fileManagerBase}${path}` : path,
        options,
      );
    },
    [containerId, fileManagerBase],
  );
  const startingPath =
    initialPath || (containerId ? "/" : "/server-engine/www");
  const [tree, setTree] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [currentPath, setCurrentPath] = React.useState(startingPath);
  const [rootPath, setRootPath] = React.useState("/");
  const [treeRootPath, setTreeRootPath] = React.useState(startingPath);
  const [treeWidth, setTreeWidth] = React.useState(288);
  const [resizingTree, setResizingTree] = React.useState(false);
  const [treeDividerHover, setTreeDividerHover] = React.useState(false);
  const [treeHeight, setTreeHeight] = React.useState(560);
  const [diskInfo, setDiskInfo] = React.useState(null);
  const [pathInput, setPathInput] = React.useState(startingPath);
  const [selectedPaths, setSelectedPaths] = React.useState([]);
  const [clipboard, setClipboard] = React.useState([]);
  const [clipboardMode, setClipboardMode] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [editor, setEditor] = React.useState(null);
  const [editorExpanded, setEditorExpanded] = React.useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [dialog, setDialog] = React.useState(null);
  const uploadInput = React.useRef(null);
  const folderInput = React.useRef(null);
  const dragDepth = React.useRef(0);
  const treeViewport = React.useRef(null);
  const treeResizeStart = React.useRef(null);
  React.useEffect(() => {
    const handlePointerMove = (event) => {
      if (!treeResizeStart.current) return;
      const nextWidth =
        treeResizeStart.current.width +
        event.clientX -
        treeResizeStart.current.x;
      setTreeWidth(Math.min(800, Math.max(220, nextWidth)));
    };
    const handlePointerUp = () => {
      if (!treeResizeStart.current) return;
      treeResizeStart.current = null;
      setResizingTree(false);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);
  const contextReference = React.useMemo(() => {
    if (!contextMenu) return null;
    return {
      getBoundingClientRect: () => ({
        x: contextMenu.x,
        y: contextMenu.y,
        top: contextMenu.y,
        left: contextMenu.x,
        right: contextMenu.x,
        bottom: contextMenu.y,
        width: 0,
        height: 0,
      }),
    };
  }, [contextMenu]);
  const { refs: contextRefs, floatingStyles: contextFloatingStyles } =
    useFloating({
      open: Boolean(contextMenu),
      placement: "bottom-start",
      strategy: "fixed",
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    });
  const selectedEntries = entries.filter((entry) =>
    selectedPaths.includes(entry.path),
  );
  const selected = selectedEntries[0];
  const notify = (message, type = "success") => setToast({ message, type });
  const conflictSummary = (conflicts) => (
    <div className="space-y-3">
      <p>
        These items already exist in the destination. Choose overwrite to
        replace them.
      </p>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-950">
        {conflicts.slice(0, 50).map((path, index) => (
          <div
            key={`${path}-${index}`}
            className="truncate border-b border-neutral-200 px-2 py-1.5 font-mono text-xs last:border-b-0 dark:border-neutral-800"
            title={path}
          >
            {path}
          </div>
        ))}
      </div>
      {conflicts.length > 50 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Showing the first 50 of {conflicts.length} conflicts.
        </p>
      )}
    </div>
  );
  const editorDirty = Boolean(
    editor && editor.content !== editor.originalContent,
  );
  function requestCloseEditor() {
    if (!editorDirty) {
      setEditor(null);
      setEditorExpanded(false);
      return;
    }
    setDialog({
      kind: "confirm",
      tone: "danger",
      title: "Discard unsaved changes?",
      message:
        "This file has changed. Close the editor and discard those changes?",
      submitLabel: "Discard changes",
      onSubmit: () => {
        setDialog(null);
        setEditor(null);
        setEditorExpanded(false);
      },
    });
  }
  const loadTree = React.useCallback(
    (path = "/") =>
      apiRequest(
        `/api/v1/file-manager/tree?path=${encodeURIComponent(path)}&depth=1`,
      ).then((response) => (response.ok ? response.json() : null)),
    [],
  );
  const loadTreeRoot = React.useCallback(
    (path = "/server-engine/www") =>
      loadTree(path)
        .then(setTree)
        .catch(() => {}),
    [loadTree],
  );
  const expandTree = React.useCallback(
    (path) =>
      loadTree(path)
        .then((branch) => {
          if (!branch) return;
          setTree((current) => {
            const update = (node) =>
              node.path === path
                ? { ...node, children: branch.children || [] }
                : { ...node, children: (node.children || []).map(update) };
            return current ? update(current) : current;
          });
        })
        .catch(() => {}),
    [loadTree],
  );
  const loadEntries = React.useCallback((path = "/") => {
    const nextPath = path || "/";
    setCurrentPath(nextPath);
    setPathInput(nextPath);
    setSelectedPaths([]);
    setContextMenu(null);
    return apiRequest(
      `/api/v1/file-manager/entries?path=${encodeURIComponent(nextPath)}`,
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        return response.json();
      })
      .then((value) => setEntries(value.entries || []))
      .catch((error) => {
        setEntries([]);
        setDialog({
          kind: "error",
          title: "Path not found",
          message: error.message || "The folder could not be opened.",
        });
      });
  }, []);
  React.useEffect(() => {
    apiRequest("/api/v1/file-manager/root")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        const defaultPath =
          startingPath || value?.default_path || "/server-engine/www";
        setRootPath(value?.root_path || "/");
        setTreeRootPath(defaultPath);
        setPathInput(defaultPath);
        loadEntries(defaultPath);
        loadTreeRoot(defaultPath);
      })
      .catch(() => {
        loadEntries("/server-engine/www");
        loadTreeRoot("/server-engine/www");
      });
  }, [loadTreeRoot, loadEntries, startingPath]);
  React.useEffect(() => {
    if (containerId || !treeViewport.current) return undefined;
    const updateTreeHeight = () => {
      const height =
        treeViewport.current?.getBoundingClientRect().height || 560;
      setTreeHeight(Math.max(240, Math.floor(height)));
    };
    updateTreeHeight();
    const observer = new ResizeObserver(updateTreeHeight);
    observer.observe(treeViewport.current);
    apiRequest("/api/v1/system/server-info")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => value?.disk && setDiskInfo(value.disk))
      .catch(() => {});
    return () => observer.disconnect();
  }, [apiRequest, containerId]);
  React.useEffect(() => {
    contextRefs.setReference(contextReference);
  }, [contextReference, contextRefs]);
  React.useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);
  const refresh = () =>
    Promise.all([loadTreeRoot(treeRootPath), loadEntries(currentPath)]);
  const openPath = (event) => {
    event.preventDefault();
    loadEntries(pathInput.trim() || "/");
  };
  const toggleSelected = (path, checked) =>
    setSelectedPaths((paths) =>
      checked
        ? [...new Set([...paths, path])]
        : paths.filter((item) => item !== path),
    );
  const askForm = (title, label, value, submitLabel, callback, hint = "") => {
    const state = { kind: "form", title, label, value, submitLabel, hint };
    state.onChange = (next) => {
      state.value = next;
      setDialog((current) => ({ ...current, value: next }));
    };
    state.onSubmit = (next) => {
      const submitted = next || state.value;
      if (submitted?.trim()) {
        setDialog(null);
        callback(submitted.trim());
      }
    };
    setDialog(state);
  };
  function createFolder() {
    askForm(
      "Create folder",
      "Folder name",
      "",
      "Create folder",
      async (name) => {
        const response = await apiRequest("/api/v1/file-manager/folders", {
          method: "POST",
          body: JSON.stringify({ path: currentPath, name }),
        });
        notify(
          response.ok ? "Folder created." : await readApiError(response),
          response.ok ? "success" : "error",
        );
        await refresh();
      },
    );
  }
  function createFile() {
    askForm(
      "Create file",
      "File name",
      "",
      "Create file",
      async (name) => {
        const response = await apiRequest("/api/v1/file-manager/files", {
          method: "POST",
          body: JSON.stringify({ path: currentPath, name }),
        });
        if (response.ok) {
          const created = await response.json();
          notify("File created.");
          await refresh();
          setSelectedPaths([created.path]);
        } else {
          notify(await readApiError(response), "error");
          await refresh();
        }
      },
      "Create any file name or extension, such as .php, .js, .env, or .txt.",
    );
  }
  function renameItem() {
    if (!selected) return;
    askForm(
      "Rename item",
      "New name",
      selected.name,
      "Rename",
      async (name) => {
        const response = await apiRequest("/api/v1/file-manager/rename", {
          method: "POST",
          body: JSON.stringify({ path: selected.path, name }),
        });
        notify(
          response.ok ? "Renamed." : await readApiError(response),
          response.ok ? "success" : "error",
        );
        await refresh();
      },
    );
  }
  function changePermissions() {
    if (!selected) return;
    const state = {
      kind: "permissions",
      title: "Change permissions",
      mode: selected.permissions || "0644",
      submitLabel: "Save permissions",
      hint: "Choose access for the owner, group, and other users.",
    };
    state.onModeChange = (mode) => {
      state.mode = mode;
      setDialog({ ...state });
    };
    state.onSubmit = async () => {
      setDialog(null);
      const response = await apiRequest("/api/v1/file-manager/permissions", {
        method: "POST",
        body: JSON.stringify({ path: selected.path, mode: state.mode }),
      });
      notify(
        response.ok ? "Permissions updated." : await readApiError(response),
        response.ok ? "success" : "error",
      );
      await refresh();
    };
    setDialog(state);
  }
  function deleteItems() {
    if (!selectedPaths.length) return;
    setDialog({
      kind: "confirm",
      title: "Delete selected items?",
      message: `This will permanently delete ${selectedPaths.length} selected item(s).`,
      submitLabel: "Delete",
      onSubmit: async () => {
        setDialog(null);
        for (const path of selectedPaths)
          await apiRequest("/api/v1/file-manager/item", {
            method: "DELETE",
            body: JSON.stringify({ path }),
          });
        notify("Deleted.");
        await refresh();
      },
    });
  }
  function copyItems() {
    setClipboard(selectedPaths);
    setClipboardMode("copy");
    notify(
      `${selectedPaths.length} item(s) copied. Choose Paste in another folder.`,
    );
    setContextMenu(null);
  }
  function cutItems() {
    if (!selectedPaths.length) return;
    setClipboard(selectedPaths);
    setClipboardMode("cut");
    setSelectedPaths([]);
    setContextMenu(null);
    notify(
      `${selectedPaths.length} item(s) cut. Choose Paste in another folder.`,
    );
  }
  async function pasteItems() {
    const isCut = clipboardMode === "cut";
    const operation = isCut ? "move" : "copy";
    const check = await apiRequest(`/api/v1/file-manager/${operation}/check`, {
      method: "POST",
      body: JSON.stringify({ paths: clipboard, destination: currentPath }),
    });
    if (!check.ok) {
      notify(await readApiError(check), "error");
      return;
    }
    const { conflicts = [] } = await check.json();
    if (conflicts.length) {
      const proceed = await new Promise((resolve) =>
        setDialog({
          kind: "confirm",
          title: `${conflicts.length} item(s) already exist`,
          message: conflictSummary(conflicts),
          submitLabel: "Overwrite existing",
          onSubmit: () => {
            setDialog(null);
            resolve(true);
          },
          onCancel: () => {
            setDialog(null);
            resolve(false);
          },
        }),
      );
      if (!proceed) return;
    }
    const response = await apiRequest(`/api/v1/file-manager/${operation}`, {
      method: "POST",
      body: JSON.stringify({
        paths: clipboard,
        destination: currentPath,
        overwrite: conflicts.length > 0,
      }),
    });
    notify(
      response.ok ? "Pasted." : await readApiError(response),
      response.ok ? "success" : "error",
    );
    if (response.ok && isCut) {
      setClipboard([]);
      setClipboardMode(null);
    }
    await refresh();
  }
  function makeArchive() {
    if (!selectedPaths.length) return;
    askForm(
      "Create ZIP archive",
      "ZIP filename",
      "archive.zip",
      "Create archive",
      async (name) => {
        const response = await apiRequest("/api/v1/file-manager/archive", {
          method: "POST",
          body: JSON.stringify({
            paths: selectedPaths,
            destination: currentPath,
            name,
          }),
        });
        notify(
          response.ok ? "ZIP archive created." : await readApiError(response),
          response.ok ? "success" : "error",
        );
        await refresh();
      },
      "The .zip extension is added automatically when omitted.",
    );
  }
  async function extractArchive() {
    if (
      !selected ||
      selected.kind !== "file" ||
      !selected.name.toLowerCase().endsWith(".zip")
    )
      return;
    const response = await apiRequest("/api/v1/file-manager/extract", {
      method: "POST",
      body: JSON.stringify({ path: selected.path }),
    });
    notify(
      response.ok ? "Archive extracted." : await readApiError(response),
      response.ok ? "success" : "error",
    );
    await refresh();
  }
  async function editFile(entry = selected, confirmedTextMode = false) {
    if (!entry || entry.kind !== "file") {
      notify("Select a file to open in the editor.", "warning");
      return;
    }
    if (!isEditableFile(entry.name) && !confirmedTextMode) {
      setDialog({
        kind: "confirm",
        title: "Open as text?",
        message: `${entry.name} is not recognized as a text file. Opening it in the text editor may display unreadable content or damage binary data. Do you want to continue?`,
        submitLabel: "Open as text",
        tone: "danger",
        onSubmit: () => {
          setDialog(null);
          editFile(entry, true);
        },
      });
      return;
    }
    const response = await apiRequest(
      `/api/v1/file-manager/content?path=${encodeURIComponent(entry.path)}`,
    );
    if (!response.ok) {
      setDialog({
        kind: "error",
        title: "Cannot edit file",
        message: await readApiError(response),
      });
      return;
    }
    const value = await response.json();
    setEditor({
      path: entry.path,
      name: entry.name,
      content: value.content,
      originalContent: value.content,
    });
    setEditorExpanded(false);
  }
  async function saveFile() {
    const response = await apiRequest(
      `/api/v1/file-manager/content?path=${encodeURIComponent(editor.path)}`,
      { method: "PUT", body: JSON.stringify({ content: editor.content }) },
    );
    notify(
      response.ok ? "File saved." : await readApiError(response),
      response.ok ? "success" : "error",
    );
    if (response.ok) setEditor(null);
    await loadEntries(currentPath);
  }
  async function uploadFiles(filesWithPaths) {
    const uploads = filesWithPaths.filter(({ file }) => file);
    const files = uploads.map(({ file }) => file);
    if (!files.length) return;
    const paths = uploads.map(
      ({ file, relativePath }) =>
        relativePath || file.webkitRelativePath || file.name,
    );
    const check = await apiRequest("/api/v1/file-manager/upload/check", {
      method: "POST",
      body: JSON.stringify({ destination: currentPath, paths }),
    });
    if (!check.ok) {
      setDialog({
        kind: "error",
        title: "Upload check failed",
        message: await readApiError(check),
      });
      return;
    }
    const result = await check.json();
    const conflicts = result.conflicts || [];
    const proceed = conflicts.length
      ? await new Promise((resolve) =>
          setDialog({
            kind: "confirm",
            title: `${conflicts.length} file(s) already exist`,
            message: conflictSummary(conflicts),
            submitLabel: "Overwrite existing",
            onSubmit: () => {
              setDialog(null);
              resolve(true);
            },
            onCancel: () => {
              setDialog(null);
              resolve(false);
            },
          }),
        )
      : true;
    if (!proceed) return;
    const uploadName =
      uploads.length === 1 ? paths[0] : `${uploads.length} files and folders`;
    const publishUpload = (detail) =>
      window.dispatchEvent(
        new CustomEvent("serverengine:file-upload", { detail }),
      );
    publishUpload({ active: true, name: uploadName, progress: 0 });
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const relativePath = paths[index];
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `${fileManagerBase}/upload?path=${encodeURIComponent(currentPath)}&relative_path=${encodeURIComponent(relativePath)}&overwrite=${proceed === true && conflicts.includes(relativePath)}`,
      );
      xhr.withCredentials = true;
      await new Promise((resolve) => {
        xhr.upload.onprogress = (progress) => {
          if (progress.lengthComputable)
            (() => {
              const percent = Math.round(
                ((index + progress.loaded / progress.total) / files.length) *
                  100,
              );
              publishUpload({
                active: true,
                name: relativePath,
                progress: percent,
              });
            })();
        };
        xhr.onload = resolve;
        xhr.onerror = resolve;
        const form = new FormData();
        form.append("file", file, file.name);
        xhr.send(form);
      });
    }
    publishUpload({ active: false });
    notify(`${files.length} item(s) uploaded.`);
    await refresh();
  }
  async function uploadSelection(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    await uploadFiles(
      files.map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
      })),
    );
  }
  function handleDragEnter(event) {
    event.preventDefault();
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragActive(true);
  }
  function handleDragLeave(event) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragActive(false);
  }
  async function handleDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const items = [...(event.dataTransfer.items || [])].filter(
      (item) => item.kind === "file",
    );
    const entries = items
      .map((item) =>
        typeof item.webkitGetAsEntry === "function"
          ? item.webkitGetAsEntry()
          : null,
      )
      .filter(Boolean);
    if (entries.length) {
      const uploads = (
        await Promise.all(entries.map((entry) => readDroppedEntry(entry)))
      ).flat();
      if (uploads.length) {
        await uploadFiles(uploads);
        return;
      }
    }
    const files = [...(event.dataTransfer.files || [])];
    if (files.length) {
      await uploadFiles(
        files.map((file) => ({
          file,
          relativePath: file.webkitRelativePath || file.name,
        })),
      );
    }
  }
  const breadcrumbs = currentPath.split("/").filter(Boolean);
  const parentPath =
    currentPath === "/"
      ? "/"
      : currentPath.split("/").slice(0, -1).join("/") || "/";
  const downloadUrl =
    selected?.kind === "file"
      ? `${fileManagerBase}/download?path=${encodeURIComponent(selected.path)}`
      : "";
  const treeData = tree
    ? tree.path === "/"
      ? tree.children || []
      : [tree]
    : [];
  const treeInitialOpenState =
    tree && tree.path !== "/" ? { [tree.path]: true } : {};
  return (
    <div
      className={
        embedded ? "space-y-4" : "h-full min-h-0 w-full overflow-hidden"
      }
      onClick={() => {
        setContextMenu(null);
        setUploadMenuOpen(false);
      }}
    >
      <section
        className={`relative grid h-full min-h-0 w-full select-none overflow-hidden bg-white dark:bg-neutral-900 ${embedded ? "rounded-lg border border-neutral-200 dark:border-neutral-800" : ""}`}
        style={{
          gridTemplateColumns: `${treeWidth}px 2px minmax(0, 1fr)`,
        }}
      >
        <aside className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <strong className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Files
            </strong>
            <div className="flex items-center gap-1">
              <FloatingTooltip content="Up one folder">
                <button
                  type="button"
                  className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  disabled={treeRootPath === "/"}
                  onClick={() => {
                  const parent =
                    treeRootPath.split("/").slice(0, -1).join("/") || "/";
                  setTreeRootPath(parent);
                  loadTreeRoot(parent);
                  loadEntries(parent);
                  }}
                  aria-label="Go up one level"
                >
                  <CornerLeftUp size={15} />
                </button>
              </FloatingTooltip>
              <FloatingTooltip content="Refresh folders">
                <button
                  type="button"
                  className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  onClick={() => loadTreeRoot(treeRootPath)}
                  aria-label="Refresh folders"
                >
                  <RefreshCw size={15} />
                </button>
              </FloatingTooltip>
            </div>
          </div>
          <div ref={treeViewport} className="min-h-0 flex-1">
            <SimpleBar className="h-full p-2">
              <Tree
                key={`${treeRootPath}:${tree?.path || "loading"}`}
                data={treeData}
                width="100%"
                height={treeHeight}
                rowHeight={32}
                indent={18}
                openByDefault={false}
                initialOpenState={treeInitialOpenState}
                onToggle={expandTree}
                onSelect={(nodes) =>
                  nodes[0] && loadEntries(nodes[0].data.path)
                }
              >
                {TreeNode}
              </Tree>
            </SimpleBar>
          </div>
          {!embedded && diskInfo && (
            <div className="shrink-0 border-t border-neutral-200 px-4 py-2 dark:border-neutral-800">
              {(() => {
                const usagePercent = Math.min(
                  100,
                  Math.max(
                    0,
                    Number.isFinite(Number(diskInfo.percent))
                      ? Number(diskInfo.percent)
                      : (Number(diskInfo.used) /
                          Math.max(Number(diskInfo.total), 1)) *
                          100,
                  ),
                );
                return (
                  <>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                        Storage
                      </span>
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {formatBytes(diskInfo.used)} /{" "}
                        {formatBytes(diskInfo.total)}
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <span
                        className="block h-full rounded-full bg-blue-600 transition-[width] duration-500"
                        style={{
                          width: `${usagePercent}%`,
                          backgroundColor: "var(--panel-accent, #2563eb)",
                        }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </aside>
        <div
          role="separator"
          aria-label="Resize file tree"
          aria-orientation="vertical"
          title="Resize file tree"
          className="relative z-10 cursor-col-resize border-x border-neutral-200 transition-colors dark:border-neutral-800"
          style={{
            backgroundColor:
              resizingTree || treeDividerHover
                ? "#1576b8"
                : "var(--panel-surface-muted, #f5f5f5)",
          }}
          onPointerEnter={() => setTreeDividerHover(true)}
          onPointerLeave={() => setTreeDividerHover(false)}
          onPointerDown={(event) => {
            event.preventDefault();
            treeResizeStart.current = {
              x: event.clientX,
              width: treeWidth,
            };
            setResizingTree(true);
          }}
        />
        <main
          className="relative flex min-h-0 min-w-0 flex-col"
          onDragEnter={handleDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragActive && (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center border-2 border-dashed border-blue-500 bg-blue-50/90 dark:bg-blue-950/80">
              <div className="rounded-lg bg-white px-6 py-5 text-center shadow-lg dark:bg-neutral-900">
                <Upload className="mx-auto mb-2 text-blue-600" size={24} />
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Drop files or folders to upload
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Files will be added to the current folder
                </p>
              </div>
            </div>
          )}
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="flex min-w-0 items-center gap-2 overflow-auto whitespace-nowrap text-xs text-neutral-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:text-neutral-400">
              <button
                type="button"
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
                onClick={() => loadEntries("/")}
              >
                <Folder size={14} />
                Files
              </button>
              {breadcrumbs.map((part, index) => {
                const path = `/${breadcrumbs.slice(0, index + 1).join("/")}`;
                return (
                  <React.Fragment key={path}>
                    <span>/</span>
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
                      onClick={() => loadEntries(path)}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <FloatingTooltip content="Up one folder">
                <button
                  className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  disabled={currentPath === "/"}
                  onClick={() => loadEntries(parentPath)}
                  aria-label="Up one folder"
                >
                  <CornerLeftUp size={16} />
                </button>
              </FloatingTooltip>
              <FloatingTooltip content="New file">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-blue-500 hover:bg-neutral-100 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-neutral-800 dark:hover:text-blue-200"
                  onClick={createFile}
                  aria-label="New file"
                >
                  <FilePlus size={15} />
                </button>
              </FloatingTooltip>
              <FloatingTooltip content="New folder">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-yellow-500 hover:bg-neutral-100 hover:text-yellow-600 dark:text-yellow-300 dark:hover:bg-neutral-800 dark:hover:text-yellow-200"
                  onClick={createFolder}
                  aria-label="New folder"
                >
                  <FolderPlus size={15} />
                </button>
              </FloatingTooltip>
              <FloatingTooltip content="Upload">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-sky-500 hover:bg-neutral-100 hover:text-sky-700 dark:text-sky-300 dark:hover:bg-neutral-800 dark:hover:text-sky-200"
                  onClick={(event) => {
                    event.stopPropagation();
                    setUploadMenuOpen((open) => !open);
                  }}
                  aria-label="Upload"
                >
                  <Upload size={15} />
                </button>
                {uploadMenuOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      onClick={() => {
                        setUploadMenuOpen(false);
                        uploadInput.current?.click();
                      }}
                    >
                      <Upload size={14} />
                      Select files
                    </button>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      onClick={() => {
                        setUploadMenuOpen(false);
                        folderInput.current?.click();
                      }}
                    >
                      <FolderOpen size={14} />
                      Select folder
                    </button>
                  </div>
                )}
              </FloatingTooltip>
              <input
                ref={uploadInput}
                hidden
                multiple
                type="file"
                onChange={uploadSelection}
              />
              <input
                ref={folderInput}
                hidden
                multiple
                webkitdirectory=""
                directory=""
                type="file"
                onChange={uploadSelection}
              />
              <FloatingTooltip
                content={
                  selected &&
                  selected.kind === "file" &&
                  !isEditableFile(selected.name)
                    ? "Open this file as text"
                    : "Edit"
                }
              >
                <button
                  className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-amber-500 hover:bg-neutral-100 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-300 dark:hover:bg-neutral-800 dark:hover:text-amber-200"
                  disabled={!selected || selected.kind !== "file"}
                  onClick={() => editFile()}
                >
                  <Edit3 size={15} />
                </button>
              </FloatingTooltip>
              <FloatingTooltip content="Rename">
                <button
                className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-violet-500 hover:bg-neutral-100 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-violet-300 dark:hover:bg-neutral-800 dark:hover:text-violet-200"
                disabled={!selected}
                onClick={renameItem}
                >
                  <Pencil size={15} />
                </button>
              </FloatingTooltip>
              <FloatingTooltip content="Delete">
                <button
                className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-rose-500 hover:bg-neutral-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-300 dark:hover:bg-neutral-800 dark:hover:text-rose-200"
                disabled={!selectedPaths.length}
                onClick={deleteItems}
                >
                  <Trash2 size={15} />
                </button>
              </FloatingTooltip>
              {downloadUrl && (
                <FloatingTooltip content="Download">
                  <a
                    className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-emerald-500 hover:bg-neutral-100 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-neutral-800 dark:hover:text-emerald-200"
                    href={downloadUrl}
                  >
                    <Download size={15} />
                  </a>
                </FloatingTooltip>
              )}
              <FloatingTooltip content="Create ZIP">
                <button
                className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-purple-500 hover:bg-neutral-100 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-purple-300 dark:hover:bg-neutral-800 dark:hover:text-purple-200"
                disabled={!selectedPaths.length}
                onClick={makeArchive}
                >
                  <Archive size={15} />
                </button>
              </FloatingTooltip>
              <FloatingTooltip content="Extract ZIP">
                <button
                className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-orange-500 hover:bg-neutral-100 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-orange-300 dark:hover:bg-neutral-800 dark:hover:text-orange-200"
                disabled={
                  !selected || !selected.name.toLowerCase().endsWith(".zip")
                }
                onClick={extractArchive}
                >
                  <ArchiveRestore size={15} />
                </button>
              </FloatingTooltip>
              {selectedPaths.length > 0 && (
                <FloatingTooltip content="Copy selected">
                  <button
                    className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-blue-500 hover:bg-neutral-100 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-neutral-800 dark:hover:text-blue-200"
                    onClick={copyItems}
                    aria-label="Copy selected"
                  >
                    <Copy size={15} />
                  </button>
                </FloatingTooltip>
              )}
              {selectedPaths.length > 0 && (
                <FloatingTooltip content="Cut selected">
                  <button
                    className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-indigo-500 hover:bg-neutral-100 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-neutral-800 dark:hover:text-indigo-200"
                    onClick={cutItems}
                    aria-label="Cut selected"
                  >
                    <Scissors size={15} />
                  </button>
                </FloatingTooltip>
              )}
              {clipboard.length > 0 && (
                <FloatingTooltip content="Paste">
                  <button
                    className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-emerald-500 hover:bg-neutral-100 hover:text-emerald-700 dark:text-emerald-300 dark:hover:bg-neutral-800 dark:hover:text-emerald-200"
                    onClick={pasteItems}
                    aria-label="Paste"
                  >
                    <ClipboardPaste size={15} />
                  </button>
                </FloatingTooltip>
              )}
              <FloatingTooltip content="Refresh files">
                <button
                  className="file-toolbar-button inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  onClick={() => loadEntries(currentPath)}
                >
                  <RefreshCw size={15} />
                </button>
              </FloatingTooltip>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-[1.5rem_minmax(12rem,1.6fr)_4rem_7rem_5rem_5rem_8rem_1.5rem] items-center gap-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            <span className="flex items-center">
              <input
                type="checkbox"
                aria-label="Select all files and folders"
                checked={
                  entries.length > 0 &&
                  entries.every((entry) => selectedPaths.includes(entry.path))
                }
                onChange={(event) =>
                  setSelectedPaths(
                    event.target.checked
                      ? entries.map((entry) => entry.path)
                      : [],
                  )
                }
                className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 accent-blue-600 dark:border-neutral-600 dark:bg-neutral-800"
              />
            </span>
            <span>Name</span>
            <span>Ext</span>
            <span>Owner</span>
            <span>Size</span>
            <span>Mode</span>
            <span>Modified</span>
            <span />
          </div>
          <div
            className="min-h-0 flex-1"
            onContextMenu={(event) => {
              if (event.target.closest("[data-file-entry]")) return;
              event.preventDefault();
              setSelectedPaths([]);
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                empty: true,
              });
            }}
          >
            <SimpleBar className="h-full">
              {entries.length ? (
                entries.map((entry) => (
                  <div
                    key={entry.path}
                    data-file-entry
                    className={`grid select-none grid-cols-[1.5rem_minmax(12rem,1.6fr)_4rem_7rem_5rem_5rem_8rem_1.5rem] items-center gap-2 border-t border-neutral-100 px-4 py-3 text-left text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ${selectedPaths.includes(entry.path) ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}
                    onClick={() =>
                      toggleSelected(
                        entry.path,
                        !selectedPaths.includes(entry.path),
                      )
                    }
                    onDoubleClick={() =>
                      entry.kind === "folder"
                        ? loadEntries(entry.path)
                        : editFile(entry)
                    }
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (!selectedPaths.includes(entry.path))
                        setSelectedPaths([entry.path]);
                      setContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        empty: false,
                      });
                    }}
                  >
                    <input
                      className="h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-offset-neutral-900"
                      type="checkbox"
                      checked={selectedPaths.includes(entry.path)}
                      onChange={(event) =>
                        toggleSelected(entry.path, event.target.checked)
                      }
                      onClick={(event) => event.stopPropagation()}
                    />
                    <span className="flex min-w-0 items-center gap-2 text-neutral-700 dark:text-neutral-200">
                      {entry.kind === "folder" ? (
                        <Folder
                          size={17}
                          className="fill-blue-500 text-blue-500 dark:fill-blue-300 dark:text-blue-300"
                        />
                      ) : (
                        <File
                          size={17}
                          className="text-neutral-400 dark:text-neutral-500"
                        />
                      )}
                      <strong className="truncate font-semibold">
                        {entry.name}
                      </strong>
                    </span>
                    <span>
                      {entry.kind === "folder"
                        ? "—"
                        : fileExtension(entry.name)}
                    </span>
                    <span>{entry.owner}</span>
                    <span>
                      {entry.kind === "folder" ? "—" : formatBytes(entry.size)}
                    </span>
                    <code className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {entry.permissions}
                    </code>
                    <FloatingTooltip
                      content={formatFullTime(entry.modified_at)}
                      className="inline-flex min-w-0 justify-self-start"
                    >
                      <span className="truncate">
                        {formatRelativeTime(entry.modified_at)}
                      </span>
                    </FloatingTooltip>
                    <FloatingTooltip content={`More actions for ${entry.name}`}>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                        aria-label={`More actions for ${entry.name}`}
                        onClick={(event) => {
                        event.stopPropagation();
                        if (!selectedPaths.includes(entry.path))
                          setSelectedPaths([entry.path]);
                        setContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          empty: false,
                        });
                        }}
                      >
                        <MoreVertical size={15} />
                      </button>
                    </FloatingTooltip>
                  </div>
                ))
              ) : (
                <div
                  className="grid place-items-center px-4 py-16 text-sm text-neutral-500 dark:text-neutral-400"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedPaths([]);
                    setContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      empty: true,
                    });
                  }}
                >
                  This folder is empty.
                </div>
              )}
            </SimpleBar>
          </div>
          {contextMenu && (
            <div
              ref={contextRefs.setFloating}
              className="z-50 max-h-[calc(100vh-1rem)] w-52 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1.5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
              style={contextFloatingStyles}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="border-b border-neutral-200 px-2.5 pb-2 pt-1 dark:border-neutral-800">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  {contextMenu.empty ? "Current folder" : "Selected item"}
                </p>
                <p
                  className="mt-0.5 truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                  title={selected?.name}
                >
                  {contextMenu.empty
                    ? currentPath
                    : selected?.name || "Multiple items"}
                </p>
              </div>
              {contextMenu.empty && (
                <>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    onClick={() => {
                      setContextMenu(null);
                      createFolder();
                    }}
                  >
                    <FolderPlus size={14} />
                    New folder
                  </button>
                  {clipboard.length > 0 && (
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      onClick={() => {
                        setContextMenu(null);
                        pasteItems();
                      }}
                    >
                      <ClipboardPaste size={14} />
                      Paste
                    </button>
                  )}
                </>
              )}
              {!contextMenu.empty && selectedPaths.length > 0 && (
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  onClick={() => {
                    setContextMenu(null);
                    copyItems();
                  }}
                >
                  <Copy size={14} />
                  Copy
                </button>
              )}
              {!contextMenu.empty && selectedPaths.length > 0 && (
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  onClick={() => {
                    setContextMenu(null);
                    cutItems();
                  }}
                >
                  <Scissors size={14} />
                  Cut
                </button>
              )}
              {!contextMenu.empty && selected?.kind === "file" && (
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  onClick={() => {
                    setContextMenu(null);
                    editFile();
                  }}
                >
                  <Edit3 size={14} />
                  Edit
                </button>
              )}
              {!contextMenu.empty &&
                selected?.kind === "file" &&
                downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={selected.name}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    onClick={() => setContextMenu(null)}
                  >
                    <Download size={14} />
                    Download
                  </a>
                )}
              {!contextMenu.empty && selected && (
                <>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    onClick={() => {
                      setContextMenu(null);
                      renameItem();
                    }}
                  >
                    <Pencil size={14} />
                    Rename
                  </button>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    onClick={() => {
                      setContextMenu(null);
                      changePermissions();
                    }}
                  >
                    <LockKeyhole size={14} />
                    Permissions
                  </button>
                </>
              )}
              {!contextMenu.empty && selectedPaths.length > 0 && (
                <button
                  type="button"
                  className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  onClick={() => {
                    setContextMenu(null);
                    makeArchive();
                  }}
                >
                  <Archive size={14} />
                  Create ZIP
                </button>
              )}
              {!contextMenu.empty &&
                selected?.kind === "file" &&
                selected.name.toLowerCase().endsWith(".zip") && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    onClick={() => {
                      setContextMenu(null);
                      extractArchive();
                    }}
                  >
                    <ArchiveRestore size={14} />
                    Extract ZIP
                  </button>
                )}
              {!contextMenu.empty && selectedPaths.length > 0 && (
                <button
                  type="button"
                  className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  onClick={() => {
                    setContextMenu(null);
                    deleteItems();
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>
          )}
        </main>
      </section>
      {editor && (
        <div
          className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto ${editorExpanded ? "bg-white p-0 dark:bg-neutral-900" : "bg-neutral-950/60 p-4 sm:p-8"}`}
          onMouseDown={(event) =>
            event.target === event.currentTarget && requestCloseEditor()
          }
        >
          <section
            className={`w-full overflow-hidden bg-white dark:bg-neutral-900 ${editorExpanded ? "flex h-screen max-h-screen max-w-none flex-col rounded-none border-0 p-5 shadow-none" : "max-w-5xl rounded-xl border border-neutral-200 p-5 shadow-2xl dark:border-neutral-800"}`}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  FILE EDITOR
                </p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  {editor.name}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <FloatingTooltip content={editorExpanded ? "Exit full view" : "Full view"}>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    aria-label={editorExpanded ? "Exit full view" : "Full view"}
                    onClick={() => setEditorExpanded((expanded) => !expanded)}
                  >
                    {editorExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                </FloatingTooltip>
                <FloatingTooltip content="Close editor">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    aria-label="Close editor"
                    onClick={requestCloseEditor}
                  >
                    <X size={18} />
                  </button>
                </FloatingTooltip>
              </div>
            </div>
            <div
              className={editorExpanded ? "min-h-0 flex-1 overflow-auto" : ""}
            >
              <ConfigEditor
                path={editor.path}
                value={editor.content}
                height={editorExpanded ? "calc(100vh - 14rem)" : "24rem"}
                onChange={(value) =>
                  setEditor((current) => ({ ...current, content: value }))
                }
              />
            </div>
            <div className="mt-4 flex shrink-0 justify-end gap-2">
              <button
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={requestCloseEditor}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={saveFile}
              >
                Save file
              </button>
            </div>
          </section>
        </div>
      )}
      <ActionDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSubmit={() => dialog?.onSubmit?.()}
      />
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

export default function FileManagerPage() {
  return <FileManagerWorkspace />;
}
