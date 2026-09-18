import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { GitBranch } from "../stores/chat";

const FALLBACK_BRANCHES: (GitBranch & { dirty?: number })[] = [
  { name: "master", is_current: false, is_remote: false },
  { name: "dev", is_current: true, is_remote: false, dirty: 3 },
];

function BranchIco() {
  return (
    <svg className="branch-ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="18" r="2.2" />
      <circle cx="7" cy="6" r="2.2" />
      <circle cx="17" cy="12" r="2.2" />
      <path d="M7 8.2v7.6M9.2 6h3.3a4.5 4.5 0 0 1 4.5 4.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="branch-menu-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

interface BranchMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  project: string;
  branch: string;
  branches: GitBranch[];
  loading?: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
  onCreateBranch?: (name: string) => Promise<void>;
}

/** Prototype #branchMenu — pick / create branch beside composer ctx-bar. */
export function BranchMenu({
  open,
  anchorEl,
  project,
  branch,
  branches,
  loading,
  onSelect,
  onClose,
  onCreateBranch,
}: BranchMenuProps) {
  const { t } = useTranslation("composer");
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [extra, setExtra] = useState<GitBranch[]>([]);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const source = useMemo(() => {
    const base = branches.length > 0 ? branches : FALLBACK_BRANCHES;
    const names = new Set(base.map((b) => b.name));
    return [...base, ...extra.filter((b) => !names.has(b.name))];
  }, [branches, extra]);

  const filtered = useMemo(
    () => source.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase())),
    [source, query],
  );

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuH = menuRef.current?.offsetHeight || 280;
      const menuW = 300;
      let top = rect.top - menuH - 8;
      if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - menuH - 8);
      let left = Math.min(rect.left, window.innerWidth - menuW - 8);
      if (left < 8) left = 8;
      setPos({ top: Math.round(top), left: Math.round(left) });
    };
    place();
    const id = window.setTimeout(place, 0);
    return () => window.clearTimeout(id);
  }, [open, anchorEl, filtered.length, creating, loading]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCreating(false);
      setNewName("");
      return;
    }
    const id = window.setTimeout(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!creating) return;
    createRef.current?.focus();
  }, [creating]);

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
        if (creating) {
          setCreating(false);
          setNewName("");
          return;
        }
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
  }, [open, anchorEl, onClose, creating]);

  const commitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (onCreateBranch) {
      await onCreateBranch(name);
    } else {
      setExtra((prev) => [...prev, { name, is_current: false, is_remote: false }]);
      onSelect(name);
    }
    onClose();
  };

  if (!open) return null;

  const searchPlaceholder = project
    ? t("searchProjectBranch", { project })
    : t("searchBranch");

  return createPortal(
    <div
      ref={menuRef}
      className="branch-menu open"
      id="branchMenu"
      role="menu"
      aria-label={t("selectBranch")}
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="branch-menu-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={t("searchBranch")}
          autoComplete="off"
        />
      </div>
      <div className="branch-menu-section">{t("branchSection")}</div>
      <div className="branch-menu-list" role="group" aria-label={t("branchList")}>
        {loading ? (
          <div className="px-2.5 py-2 text-[13px] text-[#888]">{t("loadingBranches")}</div>
        ) : filtered.length === 0 ? (
          <div className="px-2.5 py-2 text-[13px] text-[#888]">{t("noBranches")}</div>
        ) : (
          filtered.map((b) => {
            const dirty = "dirty" in b ? (b as { dirty?: number }).dirty : undefined;
            return (
              <button
                key={b.name}
                type="button"
                className={`branch-menu-item${branch === b.name ? " is-active" : ""}`}
                role="menuitem"
                onClick={() => {
                  onSelect(b.name);
                  onClose();
                }}
              >
                <BranchIco />
                <span className="branch-menu-item-body">
                  <span className="branch-menu-item-label">{b.name}</span>
                  {dirty != null && dirty > 0 && (
                    <span className="branch-menu-item-meta">
                      {t("uncommittedFiles", { count: dirty })}
                    </span>
                  )}
                  {b.is_remote && !dirty && (
                    <span className="branch-menu-item-meta">{t("branchRemote")}</span>
                  )}
                </span>
                <CheckIcon />
              </button>
            );
          })
        )}
      </div>
      <div className="branch-menu-sep" role="separator" />
      {creating ? (
        <div className="flex gap-1 px-1 pb-1 pt-0.5">
          <input
            ref={createRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCreate();
              }
            }}
            placeholder={t("createBranchPrompt")}
            className="flex-1 bg-[#1e1e1e] border border-[#333] rounded-md px-2 py-1.5 text-[12.5px] outline-none text-[#e0e0e0]"
            aria-label={t("createBranchPrompt")}
          />
          <button
            type="button"
            onClick={commitCreate}
            className="px-2.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[12px] font-medium"
          >
            {t("createBranchOk")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="branch-menu-action"
          role="menuitem"
          onClick={() => setCreating(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("createBranch")}
        </button>
      )}
    </div>,
    document.body,
  );
}
