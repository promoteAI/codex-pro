import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MOCK_AGENT, MOCK_BROWSER_TABS } from "../mock/seeds";
import { toast } from "../stores/toast";
import { useChatStore } from "../stores/chat";

const ADD_PLUGINS = [
  { id: "docs", box: "docs", glyph: "D", name: "Documents", desc: "Create and edit documents" },
  { id: "pdf", box: "pdf", glyph: "P", name: "PDF", desc: "Read, create, and verify PDFs" },
  { id: "sheets", box: "sheets", glyph: "S", name: "Spreadsheets", desc: "Create and edit spreadsheets" },
  { id: "slides", box: "slides", glyph: "P", name: "Presentations", desc: "Create and edit presentations" },
  {
    id: "tpl",
    box: "tpl",
    glyph: "◆",
    name: "Template Creator",
    desc: "Create or update reusable templates from reference content",
  },
  { id: "viz", box: "viz", glyph: "v", name: "Visualize", desc: "Create interactive visuals" },
] as const;

const EXTRA_TABS = [
  ...MOCK_BROWSER_TABS,
  {
    title: "www. ···",
    suffix: "· Chrome",
    url: "https://www.google.com.hk/goto?url=...",
    globe: true,
  },
];

interface ComposerAddMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onOpenProject: () => void;
  onGoal: () => void;
  onPlan: () => void;
}

/** Prototype #addMenu — composer + menu with plugins / agents / tabs. */
export function ComposerAddMenu({
  open,
  anchorEl,
  onClose,
  onOpenProject,
  onGoal,
  onPlan,
}: ComposerAddMenuProps) {
  const { t } = useTranslation("composer");
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuH = menuRef.current?.offsetHeight || 420;
      const menuW = Math.min(420, window.innerWidth - 24);
      let top = rect.top - menuH - 8;
      if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - Math.min(menuH, window.innerHeight - 16) - 8);
      let left = Math.min(rect.left, window.innerWidth - menuW - 8);
      if (left < 8) left = 8;
      setPos({ top: Math.round(top), left: Math.round(left) });
    };
    place();
    const id = window.setTimeout(place, 0);
    return () => window.clearTimeout(id);
  }, [open, anchorEl]);

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
      className="add-menu open"
      id="addMenu"
      role="menu"
      aria-label={t("add")}
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="add-menu-sec">{t("addSection")}</div>
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onClose();
          fileInputRef.current?.click();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8.5 14.5 7-7a2.5 2.5 0 0 1 3.5 3.5l-8.5 8.5a4 4 0 0 1-5.7-5.7l8.2-8.2" />
          <path d="M14 7.5 16.5 10" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">{t("addFiles")}</span>
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const addFile = useChatStore.getState().addFile;
          for (const file of files) void addFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onClose();
          onOpenProject();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">
            {t("addWork")} <span className="muted">{t("addWorkHint")}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onGoal();
          onClose();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">
            {t("addGoal")} <span className="muted">{t("addGoalHint")}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onPlan();
          onClose();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 18h6M10 21h4" />
          <path d="M8.5 14c-.8-1-1.3-2.1-1.3-3.4A4.8 4.8 0 0 1 12 5.8 4.8 4.8 0 0 1 16.8 10.6c0 1.3-.5 2.4-1.3 3.4-.6.7-1.2 1.2-1.5 2H10c-.3-.8-.9-1.3-1.5-2Z" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">
            {t("addPlan")} <span className="muted">{t("addPlanHint")}</span>
          </span>
        </span>
      </button>

      <div className="add-menu-sec">{t("addPlugins")}</div>
      {ADD_PLUGINS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="add-menu-item"
          role="menuitem"
          onClick={() => {
            onClose();
            toast.info(p.name);
          }}
        >
          <span className={`add-menu-ico-box ${p.box}`} aria-hidden="true">
            {p.glyph}
          </span>
          <span className="add-menu-body">
            <span className="add-menu-title">{p.name}</span>
            <span className="add-menu-desc">{p.desc}</span>
          </span>
        </button>
      ))}
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onClose();
          toast.info("Superpowers");
        }}
      >
        <span className="add-menu-ico-box sp" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1" />
            <path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1" />
          </svg>
        </span>
        <span className="add-menu-body">
          <span className="add-menu-title">Superpowers</span>
          <span className="add-menu-desc">Plan, develop, and debug code</span>
        </span>
      </button>

      <div className="add-menu-sec">{t("addAgents")}</div>
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onClose();
          toast.info(MOCK_AGENT.name);
        }}
      >
        <span className="add-menu-body">
          <span className="add-menu-title">{MOCK_AGENT.name}</span>
          <span className="add-menu-desc">{MOCK_AGENT.desc}</span>
        </span>
      </button>

      <div className="add-menu-sec">{t("addTabs")}</div>
      {EXTRA_TABS.map((tab) => (
        <button
          key={tab.url}
          type="button"
          className="add-menu-item"
          role="menuitem"
          onClick={() => {
            onClose();
            toast.info(tab.title);
          }}
        >
          {"globe" in tab && tab.globe ? (
            <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M3.5 12h17M12 3.5a14 14 0 0 1 0 17M12 3.5a14 14 0 0 0 0 17" />
            </svg>
          ) : (
            <span className="add-menu-ico-box g" aria-hidden="true">
              G
            </span>
          )}
          <span className="add-menu-body">
            <span className="add-menu-row">
              <span className="add-menu-title">{tab.title}</span>
              <span className="add-menu-suffix">{tab.suffix}</span>
            </span>
            <span className="add-menu-desc">{tab.url}</span>
          </span>
        </button>
      ))}

      <div className="add-menu-sec">{t("addFilesChats")}</div>
      <div className="add-menu-hint">{t("addSearchHint")}</div>
      <div className="add-menu-sec">{t("placeholder")}</div>
    </div>,
    document.body,
  );
}
