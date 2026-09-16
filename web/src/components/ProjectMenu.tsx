import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { GitRepo } from "../stores/chat";
import { toast } from "../stores/toast";
import { useShellStore } from "../stores/shell";

/** Fallback workspaces matching prototype #projectMenu when /git/repos is empty. */
const FALLBACK_PROJECTS: GitRepo[] = [
  { name: "codex-pro", path: "/codex-pro", current_branch: "dev" },
  { name: "m-askkb", path: "/m-askkb", current_branch: "main" },
  { name: "DeepTutor", path: "/DeepTutor", current_branch: "main" },
];

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function OpenFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 17.5h9.2a3.8 3.8 0 0 0 .3-7.6 5.2 5.2 0 0 0-10.1 1.4A3.4 3.4 0 0 0 7.5 17.5Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="proj-menu-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

interface ProjectMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  project: string;
  repos: GitRepo[];
  onSelect: (repo: GitRepo) => void;
  onCreate: () => void;
  onClose: () => void;
}

/** Prototype #projectMenu — pick workspace, open folder, remote, or no project. */
export function ProjectMenu({
  open,
  anchorEl,
  project,
  repos,
  onSelect,
  onCreate,
  onClose,
}: ProjectMenuProps) {
  const { t } = useTranslation("composer");
  const openRemote = useShellStore((s) => s.openRemoteConnect);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const source = repos.length > 0 ? repos : FALLBACK_PROJECTS;
  const filtered = useMemo(
    () => source.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())),
    [source, query],
  );

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuH = menuRef.current?.offsetHeight || 280;
      const menuW = 280;
      let top = rect.top - menuH - 8;
      if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - menuH - 8);
      let left = Math.min(rect.left, window.innerWidth - menuW - 8);
      if (left < 8) left = 8;
      setPos({ top: Math.round(top), left: Math.round(left) });
    };
    place();
    const t = window.setTimeout(place, 0);
    return () => window.clearTimeout(t);
  }, [open, anchorEl, filtered.length]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onResize = () => onClose();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, anchorEl, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="proj-menu open"
      id="projectMenu"
      role="menu"
      aria-label={t("selectWorkspace")}
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="proj-menu-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchWorkspace")}
          aria-label={t("searchWorkspace")}
          autoComplete="off"
        />
      </div>
      <div className="proj-menu-list" role="group" aria-label={t("workspaceList")}>
        {filtered.length === 0 && (
          <div className="px-2.5 py-2 text-[13px] text-[#888]">{t("noRepos")}</div>
        )}
        {filtered.map((p) => (
          <button
            key={p.path}
            type="button"
            className={`proj-menu-item${project === p.name ? " is-active" : ""}`}
            role="menuitem"
            onClick={() => {
              onSelect(p);
              onClose();
            }}
          >
            <FolderIcon />
            <span className="proj-menu-item-label">{p.name}</span>
            <CheckIcon />
          </button>
        ))}
      </div>
      <div className="proj-menu-sep" role="separator" />
      <button
        type="button"
        className="proj-menu-action"
        role="menuitem"
        onClick={() => {
          onClose();
          onCreate();
        }}
      >
        <FolderIcon />
        {t("createProject")}
      </button>
      <button
        type="button"
        className="proj-menu-action"
        role="menuitem"
        onClick={() => {
          onClose();
          toast.info(t("openFolderToast"));
        }}
      >
        <OpenFolderIcon />
        {t("openFolder")}
      </button>
      <button
        type="button"
        className="proj-menu-action"
        role="menuitem"
        onClick={() => {
          onClose();
          openRemote();
        }}
      >
        <CloudIcon />
        {t("remoteConnect")}
      </button>
      <button
        type="button"
        className="proj-menu-action"
        role="menuitem"
        onClick={() => {
          onSelect({ name: "", path: "", current_branch: "" });
          onClose();
        }}
      >
        <ChatIcon />
        {t("noProject")}
      </button>
    </div>,
    document.body,
  );
}
