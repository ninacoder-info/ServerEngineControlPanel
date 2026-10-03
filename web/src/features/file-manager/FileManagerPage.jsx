import React from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
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
  MoreHorizontal,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Tree } from "react-arborist";
import ActionDialog from "../../components/ActionDialog";
import Toast from "../../components/Toast";
import ConfigEditor from "../services/ConfigEditor";
import { apiRequest as requestApi, readApiError } from "../../lib/api";

const formatBytes = (value) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const EDITABLE_EXTENSIONS = new Set([
  "bash", "c", "cjs", "conf", "cpp", "css", "env", "go", "h", "hpp",
  "htaccess", "htm", "html", "ini", "java", "js", "json", "jsx", "less",
  "lock", "log", "mjs", "md", "php", "phtml", "properties", "py", "rb",
  "rs", "scss", "sh", "sql", "svg", "toml", "ts", "tsx", "txt", "vue",
  "xml", "yaml", "yml", "zsh",
]);
const EDITABLE_FILENAMES = new Set([
  ".env", ".env.local", ".env.production", ".env.example", ".gitignore",
  ".htaccess", "Dockerfile", "Makefile", "README", "README.md",
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
  if (["js", "jsx", "ts", "tsx", "php", "py", "rb", "go", "rs", "css", "html"].includes(extension)) return FileCode2;
  if (["json", "yaml", "yml", "toml", "xml"].includes(extension)) return FileJson;
  if (["zip", "tar", "gz", "bz2", "7z", "rar"].includes(extension)) return FileArchive;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(extension)) return Image;
  return FileText;
}

function fileExtension(name = "") {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : "—";
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
      className={`group flex min-h-10 w-full cursor-pointer items-center rounded-md pr-2 text-sm transition-colors ${node.isSelected ? "text-blue-600 dark:text-blue-300" : "text-neutral-600 dark:text-neutral-300"}`}
      style={style}
      onClick={() => {
        node.select();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (folder && !node.isOpen) node.open();
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
        {Array.from({ length: depth }).map((_, index) => (
          <span key={index} className="-ml-2 h-10 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" aria-hidden="true" />
        ))}
        <button
          type="button"
          className="grid h-6 w-5 shrink-0 cursor-pointer place-items-center rounded text-neutral-400 dark:text-neutral-500"
          aria-label={folder ? `${node.isOpen ? "Collapse" : "Expand"} ${node.data.name}` : undefined}
          tabIndex={folder ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            if (folder) node.toggle();
          }}
        >
          {folder ? (node.isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : null}
        </button>
        <Icon size={16} className={folder ? (node.isSelected ? "text-blue-600 dark:text-blue-300" : "text-blue-500 dark:text-blue-300") : "text-neutral-400 dark:text-neutral-500"} />
        <span className="min-w-0 truncate font-medium">{node.data.name}</span>
      </div>
      <button
        type="button"
        title={`More actions for ${node.data.name}`}
        aria-label={`More actions for ${node.data.name}`}
        className="ml-2 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-neutral-700 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-neutral-200"
        onClick={(event) => {
          event.stopPropagation();
          node.select();
        }}
      >
        <MoreHorizontal size={17} />
      </button>
    </div>
  );
}

export function FileManagerWorkspace({ embedded = false, initialPath = "", containerId = "" } = {}) {
  const fileManagerBase = containerId
    ? `/api/v1/services/docker/containers/${encodeURIComponent(containerId)}/files`
    : "/api/v1/file-manager";
  const apiRequest = React.useCallback(
    (url, options) => {
      const path = containerId ? url.replace("/api/v1/file-manager", "") : url;
      return requestApi(containerId ? `${fileManagerBase}${path}` : path, options);
    },
    [containerId, fileManagerBase],
  );
  const startingPath = initialPath || (containerId ? "/" : "/server-engine/www");
  const [tree, setTree] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [currentPath, setCurrentPath] = React.useState(startingPath);
  const [rootPath, setRootPath] = React.useState("/");
  const [treeRootPath, setTreeRootPath] = React.useState(startingPath);
  const [pathInput, setPathInput] = React.useState(startingPath);
  const [selectedPaths, setSelectedPaths] = React.useState([]);
  const [clipboard, setClipboard] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [editor, setEditor] = React.useState(null);
  const [editorExpanded, setEditorExpanded] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(null);
  const [uploadMenuOpen, setUploadMenuOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState(null);
  const uploadInput = React.useRef(null);
  const folderInput = React.useRef(null);
  const selectedEntries = entries.filter((entry) =>
    selectedPaths.includes(entry.path),
  );
  const selected = selectedEntries[0];
  const notify = (message, type = "success") => setToast({ message, type });
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
      message: "This file has changed. Close the editor and discard those changes?",
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
        const defaultPath = startingPath || value?.default_path || "/server-engine/www";
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
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);
  const refresh = () => Promise.all([loadTreeRoot(treeRootPath), loadEntries(currentPath)]);
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
    notify(
      `${selectedPaths.length} item(s) copied. Choose Paste in another folder.`,
    );
    setContextMenu(null);
  }
  async function pasteItems() {
    const response = await apiRequest("/api/v1/file-manager/copy", {
      method: "POST",
      body: JSON.stringify({ paths: clipboard, destination: currentPath }),
    });
    notify(
      response.ok ? "Pasted." : await readApiError(response),
      response.ok ? "success" : "error",
    );
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
      response.ok
        ? "File saved. A backup was created."
        : await readApiError(response),
      response.ok ? "success" : "error",
    );
    if (response.ok) setEditor(null);
    await loadEntries(currentPath);
  }
  function restoreFile() {
    setDialog({
      kind: "confirm",
      title: "Restore backup?",
      message:
        "The backup created before the last save will replace the current file.",
      submitLabel: "Restore",
      onSubmit: async () => {
        setDialog(null);
        const response = await apiRequest("/api/v1/file-manager/restore", {
          method: "POST",
          body: JSON.stringify({ path: editor.path }),
        });
        notify(
          response.ok ? "Backup restored." : await readApiError(response),
          response.ok ? "success" : "error",
        );
        if (response.ok) {
          setEditor(null);
          await loadEntries(currentPath);
        }
      },
    });
  }
  async function uploadSelection(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    const paths = files.map((file) => file.webkitRelativePath || file.name);
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
            message:
              conflicts.slice(0, 12).join(", ") +
              (conflicts.length > 12
                ? ` and ${conflicts.length - 12} more…`
                : ""),
            submitLabel: "Overwrite existing",
            onSubmit: () => {
              setDialog(null);
              resolve(true);
            },
            onCancel: () => {
              setDialog(null);
              resolve("skip");
            },
          }),
        )
      : true;
    if (!proceed) return;
    setUploadProgress(0);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const relativePath = file.webkitRelativePath || file.name;
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `${fileManagerBase}/upload?path=${encodeURIComponent(currentPath)}&relative_path=${encodeURIComponent(relativePath)}&overwrite=${proceed === true && conflicts.includes(relativePath)}`,
      );
      xhr.withCredentials = true;
      await new Promise((resolve) => {
        xhr.upload.onprogress = (progress) => {
          if (progress.lengthComputable)
            setUploadProgress(
              Math.round(
                ((index + progress.loaded / progress.total) / files.length) *
                  100,
              ),
            );
        };
        xhr.onload = resolve;
        xhr.onerror = resolve;
        const form = new FormData();
        form.append("file", file, file.name);
        xhr.send(form);
      });
    }
    setUploadProgress(null);
    notify(`${files.length} item(s) uploaded.`);
    await refresh();
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
  const treeInitialOpenState = tree && tree.path !== "/" ? { [tree.path]: true } : {};
  return (
    <div
      className={embedded ? "space-y-4" : "space-y-2"}
      onClick={() => {
        setContextMenu(null);
        setUploadMenuOpen(false);
      }}
    >
      {!embedded && <div className="flex flex-col items-start justify-between gap-4 md:items-stretch">
        <div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Storage</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            File Manager
          </h2>
          <p className="mt-2 text-neutral-400">
            Browse the server filesystem. Website files default to the shared
            web root.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="mr-auto flex max-w-[min(42rem,55vw)] min-w-0 items-center gap-2 overflow-auto whitespace-nowrap text-xs text-neutral-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:text-neutral-400">
            <button type="button" className="inline-flex shrink-0 cursor-pointer items-center gap-1 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100" onClick={() => loadEntries("/")}>
              <Folder size={14} />
              Filesystem
            </button>
            {breadcrumbs.map((part, index) => {
              const path = `/${breadcrumbs.slice(0, index + 1).join("/")}`;
              return (
                <React.Fragment key={`top-${path}`}>
                  <span>/</span>
                  <button type="button" className="shrink-0 cursor-pointer hover:text-neutral-900 hover:underline dark:hover:text-neutral-100" onClick={() => loadEntries(path)}>{part}</button>
                </React.Fragment>
              );
            })}
          </div>
          <button
            className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={createFile}
          >
            <FilePlus size={14} />
            New file
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border border-neutral-300 px-2 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={createFolder}
          >
            <FolderPlus size={14} />
            New folder
          </button>
          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              onClick={(event) => {
                event.stopPropagation();
                setUploadMenuOpen((open) => !open);
              }}
            >
              <Upload size={14} />
              Upload
            </button>
            {uploadMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
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
          </div>
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
        </div>
      </div>}
      <section className="relative grid h-[38rem] min-h-0 select-none grid-cols-[18rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {uploadProgress !== null && (
          <div className="absolute inset-x-0 top-0 z-10 h-1 bg-neutral-200 dark:bg-neutral-800">
            <span className="block h-full bg-blue-600 transition-[width]" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
        <aside className="min-w-0 border-r border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <strong className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Filesystem</strong>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={treeRootPath === "/"}
                onClick={() => {
                  const parent = treeRootPath.split("/").slice(0, -1).join("/") || "/";
                  setTreeRootPath(parent);
                  loadTreeRoot(parent);
                  loadEntries(parent);
                }}
                title="Go up one level"
                aria-label="Go up one level"
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                onClick={() => loadTreeRoot(treeRootPath)}
                title="Refresh folders"
                aria-label="Refresh folders"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
          <div className="h-[35rem] overflow-auto p-2">
            <Tree
              key={treeRootPath}
              data={treeData}
              width="100%"
              height={560}
              rowHeight={34}
              indent={18}
              openByDefault={false}
              initialOpenState={treeInitialOpenState}
              onToggle={(id) => expandTree(id)}
              onSelect={(nodes) => nodes[0] && loadEntries(nodes[0].data.path)}
            >
              {TreeNode}
            </Tree>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            {embedded ? (
              <div className="flex min-w-0 items-center gap-2 overflow-auto whitespace-nowrap text-xs text-neutral-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:text-neutral-400">
                <button type="button" className="inline-flex shrink-0 cursor-pointer items-center gap-1 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100" onClick={() => loadEntries("/")}>
                  <Folder size={14} />
                  Filesystem
                </button>
                {breadcrumbs.map((part, index) => {
                  const path = `/${breadcrumbs.slice(0, index + 1).join("/")}`;
                  return <React.Fragment key={path}><span>/</span><button type="button" className="shrink-0 cursor-pointer hover:text-neutral-900 hover:underline dark:hover:text-neutral-100" onClick={() => loadEntries(path)}>{part}</button></React.Fragment>;
                })}
              </div>
            ) : <span />}
            <div className="flex shrink-0 items-center gap-1">
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={currentPath === "/"}
                onClick={() => loadEntries(parentPath)}
                title="Up one folder"
                aria-label="Up one folder"
              >
                <ArrowUpToLine size={16} />
              </button>
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={!selected || selected.kind !== "file"}
                onClick={() => editFile()}
                title={
                  selected && selected.kind === "file" && !isEditableFile(selected.name)
                    ? "Open this file as text"
                    : "Edit"
                }
              >
                <Edit3 size={15} />
              </button>
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={!selected}
                onClick={renameItem}
                title="Rename"
              >
                <Pencil size={15} />
              </button>
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={!selectedPaths.length}
                onClick={deleteItems}
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
              {downloadUrl && (
                <a className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" href={downloadUrl} title="Download">
                  <Download size={15} />
                </a>
              )}
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={!selectedPaths.length}
                onClick={makeArchive}
                title="Create ZIP"
              >
                <Archive size={15} />
              </button>
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={
                  !selected || !selected.name.toLowerCase().endsWith(".zip")
                }
                onClick={extractArchive}
                title="Extract ZIP"
              >
                <ArchiveRestore size={15} />
              </button>
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                disabled={!clipboard.length}
                onClick={pasteItems}
                title="Paste"
              >
                <Copy size={15} />
              </button>
              <button
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                onClick={() => loadEntries(currentPath)}
                title="Refresh files"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-[1.5rem_minmax(12rem,1.6fr)_5rem_7rem_6rem_6rem_12rem_1.5rem] items-center gap-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            <span className="flex items-center">
              <input
                type="checkbox"
                aria-label="Select all files and folders"
                checked={entries.length > 0 && entries.every((entry) => selectedPaths.includes(entry.path))}
                onChange={(event) => setSelectedPaths(event.target.checked ? entries.map((entry) => entry.path) : [])}
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
          <div className="min-h-0 flex-1 overflow-auto">
            {entries.length ? (
              entries.map((entry) => (
                <div
                  key={entry.path}
                  className={`grid select-none grid-cols-[1.5rem_minmax(12rem,1.6fr)_5rem_7rem_6rem_6rem_12rem_1.5rem] items-center gap-2 border-t border-neutral-100 px-4 py-3 text-left text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ${selectedPaths.includes(entry.path) ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}
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
                    setContextMenu({ x: event.clientX, y: event.clientY });
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
                      <Folder size={17} className="text-blue-500 dark:text-blue-300" />
                    ) : (
                      <File size={17} className="text-neutral-400 dark:text-neutral-500" />
                    )}
                    <strong className="truncate font-semibold">{entry.name}</strong>
                  </span>
                  <span>{entry.kind === "folder" ? "—" : fileExtension(entry.name)}</span>
                  <span>{entry.owner}</span>
                  <span>
                    {entry.kind === "folder" ? "—" : formatBytes(entry.size)}
                  </span>
                  <code className="text-[11px] text-neutral-500 dark:text-neutral-400">{entry.permissions}</code>
                  <span>
                    {new Date(entry.modified_at * 1000).toLocaleString()}
                  </span>
                  <MoreVertical size={15} />
                </div>
              ))
            ) : (
              <div className="grid place-items-center px-4 py-16 text-sm text-neutral-500 dark:text-neutral-400">This folder is empty.</div>
            )}
          </div>
          {contextMenu && (
            <div
              className="fixed z-50 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white p-1.5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="border-b border-neutral-200 px-2.5 pb-2 pt-1 dark:border-neutral-800">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Selected item</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200" title={selected?.name}>{selected?.name || "Multiple items"}</p>
              </div>
              {selectedPaths.length > 0 && (
                <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={() => { setContextMenu(null); copyItems(); }}>
                  <Copy size={14} />
                  Copy
                </button>
              )}
              {selected?.kind === "file" && (
                <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={() => { setContextMenu(null); editFile(); }}>
                  <Edit3 size={14} />
                  Edit
                </button>
              )}
              {selected && (
                <>
                  <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={() => { setContextMenu(null); renameItem(); }}>
                    <Pencil size={14} />
                    Rename
                  </button>
                  <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={() => { setContextMenu(null); changePermissions(); }}>
                    <LockKeyhole size={14} />
                    Permissions
                  </button>
                  <button type="button" className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => { setContextMenu(null); deleteItems(); }}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              )}
              {selectedPaths.length > 0 && (
                <button type="button" className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={() => { setContextMenu(null); makeArchive(); }}>
                  <Archive size={14} />
                  Create ZIP
                </button>
              )}
              {selected?.kind === "file" && selected.name.toLowerCase().endsWith(".zip") && (
                <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={() => { setContextMenu(null); extractArchive(); }}>
                  <ArchiveRestore size={14} />
                  Extract ZIP
                </button>
              )}
            </div>
          )}
        </main>
      </section>
      {editor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"
          onMouseDown={(event) =>
            event.target === event.currentTarget && requestCloseEditor()
          }
        >
          <section
            className={`w-full overflow-hidden rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 ${editorExpanded ? "max-w-none" : "max-w-5xl"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">FILE EDITOR</p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{editor.name}</h2>
                <code className="mt-1 block break-all text-xs text-neutral-500 dark:text-neutral-400">{editor.path}</code>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  title={editorExpanded ? "Exit full view" : "Full view"}
                  aria-label={editorExpanded ? "Exit full view" : "Full view"}
                  onClick={() => setEditorExpanded((expanded) => !expanded)}
                >
                  {editorExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  title="Close editor"
                  onClick={requestCloseEditor}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <ConfigEditor
              path={editor.path}
              value={editor.content}
              height={editorExpanded ? "calc(100vh - 12rem)" : "24rem"}
              onChange={(value) =>
                setEditor((current) => ({ ...current, content: value }))
              }
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={requestCloseEditor}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={restoreFile}
              >
                Restore backup
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
