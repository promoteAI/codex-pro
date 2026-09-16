import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../stores/chat";
import { toast } from "../stores/toast";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Create/open a local workspace project. Accepts a project name and a source
 *  folder — the folder may be a new subdirectory under the gateway workspace
 *  (for "new project") or any existing local directory (for "open folder"). */
export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const { t } = useTranslation("composer");
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const createProject = useChatStore((s) => s.createProject);
  const openProject = useChatStore((s) => s.openProject);

  const supportsNativePicker =
    typeof window !== "undefined" && typeof (window as any).showDirectoryPicker === "function";

  useEffect(() => {
    if (!open) return;
    setName("");
    setSelectedPath("");
    setSubmitting(false);
    const tmr = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(tmr);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const openFolderPicker = async () => {
    if (supportsNativePicker) {
      try {
        const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
        // The File System Access API doesn't expose the real filesystem path.
        // Pre-fill the path input with the handle name; the user may edit it.
        setSelectedPath(handle.name || "");
      } catch {
        // User cancelled; ignore.
      }
      return;
    }
    // Fallback for Firefox/Safari: hidden <input webkitdirectory>.
    // webkitRelativePath gives the folder name as the first path segment.
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.display = "none";
    const onChange = (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      const rel = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      setSelectedPath(rel.split("/")[0] || "/");
    };
    input.addEventListener("change", onChange);
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      nameRef.current?.focus();
      toast.info(t("projectNameRequired"));
      return;
    }
    if (!selectedPath) {
      toast.info(t("projectFolderRequired"));
      return;
    }
    setSubmitting(true);
    try {
      // "Open folder" path — send the real absolute path to the gateway.
      if ((window as any).__projectAbsolutePath) {
        await openProject((window as any).__projectAbsolutePath);
        await useChatStore.getState().loadRepos();
        onClose();
        toast.success(t("projectFolderSelected", { name: trimmed }));
        return;
      }
      await createProject(trimmed, false);
      onClose();
      toast.success(t("createProjectOk", { name: trimmed }));
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = status === 409
        ? t("projectExists")
        : String((e as Error).message || e);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="pl-modal-overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pl-modal">
        <div className="pl-modal-head">
          <h3 className="pl-modal-title" id={titleId}>
            {t("createProject")}
          </h3>
          <button type="button" className="pl-modal-close" aria-label={t("close")} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="pl-modal-field">
          <label className="pl-modal-label" htmlFor="projName">
            {t("createProjectName")}
          </label>
          <input
            ref={nameRef}
            className="pl-modal-input"
            id="projName"
            type="text"
            placeholder={t("createProjectPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        <div className="pl-modal-field">
          <span className="pl-modal-label">{t("projectSourceFolder")}</span>
          <div className="pl-folder-picker">
            <div className="pl-folder-picker-dropzone" onClick={openFolderPicker}>
              <svg className="pl-folder-picker-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                {selectedPath
                  ? t("projectFolderSelected", { name: selectedPath.split("/")[0] })
                  : t("projectFolderHint")}
              </span>
            </div>
            {/* When showDirectoryPicker is available, the browser doesn't expose
                the real filesystem path, so we show an editable input. */}
            {supportsNativePicker && selectedPath && (
              <input
                className="pl-modal-input pl-path-input"
                type="text"
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder={t("projectFolderPlaceholder")}
                spellCheck={false}
              />
            )}
          </div>
        </div>
        <div className="pl-modal-foot">
          <button type="button" className="pl-modal-cancel" onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </button>
          <button type="button" className="pl-modal-submit" onClick={() => void submit()} disabled={submitting}>
            {t("createProject")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
