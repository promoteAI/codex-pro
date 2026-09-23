import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import {
  ActionBtn,
  DropdownBtn,
  PageSub,
  PageTitle,
  SectionTitle,
  SegGroup,
  SettingsCard,
  SettingsRow,
  Toggle,
} from "../ui";
import { useSettingsStore } from "../../../stores/settings";
import type { AgentEnv } from "../../../stores/settings";

const OPEN_IN_OPTIONS: Array<{ id: string; label: string; icon: ReactNode }> = [
  {
    id: "vscode",
    label: "VS Code",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#0078d4" d="M2 2h9.5v9.5H2zm10.5 0H22v9.5h-9.5zM2 12.5H11.5V22H2zm10.5 0H22V22h-9.5z" />
      </svg>
    ),
  },
  {
    id: "cursor",
    label: "Cursor",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#e8e8e8" d="M12 2.5 3.5 8.2v7.6L12 21.5l8.5-5.7V8.2L12 2.5zm0 2.3 6.2 4.1v6.2L12 19.2l-6.2-4.1V8.9L12 4.8z" />
        <path fill="#1a1a1a" d="M12 8.2 8.2 12 12 15.8 15.8 12 12 8.2z" />
      </svg>
    ),
  },
  {
    id: "default",
    label: "Default app",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#f0c14a" d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l1.8 2H18.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-7z" />
        <path fill="#fff" d="M14.2 11.2h3.1v1.1h-1v3.3h-1.1v-3.3h-1z" />
        <path fill="#3b82f6" d="M11.2 12.8h1.6v2.8h-1.6z" />
      </svg>
    ),
  },
  {
    id: "explorer",
    label: "File Explorer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#f0c14a" d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l1.8 2H18.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-7z" />
        <path fill="#e6b422" d="M3.5 10.5h17v1.2h-17z" />
      </svg>
    ),
  },
  {
    id: "gitbash",
    label: "Git Bash",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="4" fill="#3c3c3c" />
        <path fill="#e44d26" d="M2 2h10v10H2z" />
        <path fill="#f1e05a" d="M12 2h10v10H12z" />
        <path fill="#89e051" d="M2 12h10v10H2z" />
        <path fill="#00a4ef" d="M12 12h10v10H12z" />
        <path fill="#fff" d="M6.2 8.2h1.3l2.2 3.4V8.2h1.2v6.1H9.6L7.4 10.9v3.4H6.2zm8.4 0h3.8v1.1h-2.5v1.3h2.2v1.1h-2.2v1.5h2.6v1.1h-3.9z" />
      </svg>
    ),
  },
  {
    id: "pycharm",
    label: "PyCharm",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="pcg-react" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#21d789" />
            <stop offset="100%" stopColor="#fcf84a" />
          </linearGradient>
        </defs>
        <rect width="24" height="24" rx="4" fill="url(#pcg-react)" />
        <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="Arial,sans-serif" fill="#1a1a1a">
          PC
        </text>
      </svg>
    ),
  },
];

export function GeneralPage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);
  const [openInOpen, setOpenInOpen] = useState(false);
  const openInRef = useRef<HTMLDivElement>(null);
  const openInOpt = OPEN_IN_OPTIONS.find((o) => o.id === prefs.openIn) ?? OPEN_IN_OPTIONS[0];
  const [shellOpen, setShellOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const shellOptions = ["PowerShell", "Command Prompt", "Git Bash", "WSL"];
  const [agentEnvOpen, setAgentEnvOpen] = useState(false);
  const agentEnvRef = useRef<HTMLDivElement>(null);
  const AGENT_ENV_OPTIONS: Array<{ id: AgentEnv; label: string; desc: string }> = [
    { id: "windows_native", label: t("windowsNative"), desc: "" },
    { id: "wsl", label: t("wsl"), desc: t("wslDesc") },
  ];
  // Language picker — mirrors i18next's built-in detector persistence.
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const LANG_OPTIONS: Array<{ id: string; label: string }> = [
    { id: "zh", label: t("langZh") },
    { id: "en", label: t("langEn") },
  ];
  // Notification timing picker
  const [notifyOpen, setNotifyOpen] = useState(false);
  const notifyRef = useRef<HTMLDivElement>(null);
  const NOTIFY_OPTIONS: Array<{ id: string; label: string }> = [
    { id: "unfocused", label: t("notifyUnfocused") },
    { id: "never", label: t("notifyNever") },
    { id: "always", label: t("notifyAlways") },
  ];
  // "No-project task folder" — toggle into an editable input, save on blur/Enter.
  const [noProjEditing, setNoProjEditing] = useState(false);
  const [noProjDraft, setNoProjDraft] = useState(prefs.noProjectFolder);
  const noProjRef = useRef<HTMLInputElement>(null);

  const startNoProjEdit = () => {
    setNoProjDraft(prefs.noProjectFolder);
    setNoProjEditing(true);
  };
  const commitNoProj = () => {
    const next = noProjDraft.trim() || prefs.noProjectFolder;
    setNoProjEditing(false);
    if (next !== prefs.noProjectFolder) updatePrefs({ noProjectFolder: next });
  };

  useEffect(() => {
    if (noProjEditing) noProjRef.current?.focus();
  }, [noProjEditing]);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  useEffect(() => {
    if (!openInOpen && !shellOpen && !agentEnvOpen && !langOpen && !notifyOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (openInOpen && !openInRef.current?.contains(t)) setOpenInOpen(false);
      if (shellOpen && !shellRef.current?.contains(t)) setShellOpen(false);
      if (agentEnvOpen && !agentEnvRef.current?.contains(t)) setAgentEnvOpen(false);
      if (langOpen && !langRef.current?.contains(t)) setLangOpen(false);
      if (notifyOpen && !notifyRef.current?.contains(t)) setNotifyOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenInOpen(false);
        setShellOpen(false);
        setAgentEnvOpen(false);
        setLangOpen(false);
        setNotifyOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openInOpen, shellOpen]);

  return (
    <div className="max-w-[720px]">
      <SectionTitle>{t("secPermissions")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("defaultPermissions")} desc={t("defaultPermissionsDesc")}>
          <Toggle
            checked={prefs.defaultPermissions}
            onChange={(v) => updatePrefs({ defaultPermissions: v })}
            label={t("defaultPermissions")}
          />
        </SettingsRow>
        <SettingsRow
          label={t("fullAccessPerm")}
          desc={
            <>
              {t("fullAccessPermDesc")}{" "}
              <a
                href="#"
                className="text-[#6ea8fe] hover:underline"
                onClick={(e) => e.preventDefault()}
              >
                {t("learnMore")}
              </a>
            </>
          }
        >
          <Toggle checked={prefs.fullAccess} onChange={(v) => updatePrefs({ fullAccess: v })} label={t("fullAccessPerm")} />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secGeneral")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("noProjectFolder")} desc={t("noProjectFolderDesc")}>
          {noProjEditing ? (
            <input
              ref={noProjRef}
              value={noProjDraft}
              onChange={(e) => setNoProjDraft(e.target.value)}
              onBlur={commitNoProj}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNoProj();
                if (e.key === "Escape") {
                  setNoProjDraft(prefs.noProjectFolder);
                  setNoProjEditing(false);
                }
              }}
              className="bg-codex-surface border border-codex-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text w-[280px] max-w-[40vw] outline-none"
              aria-label={t("noProjectFolder")}
            />
          ) : (
            <>
              <span className="text-[12.5px] text-[#a8a8a8] font-mono max-w-[280px] truncate">
                {prefs.noProjectFolder}
              </span>
              <ActionBtn onClick={startNoProjEdit}>{t("change")}</ActionBtn>
            </>
          )}
        </SettingsRow>
        <SettingsRow label={t("defaultOpenIn")} desc={t("defaultOpenInDesc")}>
          <div className="relative" ref={openInRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openInOpen}
              onClick={() => {
                setOpenInOpen((v) => !v);
                setShellOpen(false);
              }}
              className="inline-flex items-center gap-1.5 bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary hover:bg-codex-active whitespace-nowrap"
            >
              {openInOpt.icon}
              {openInOpt.label}
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {openInOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[196px] p-1.5 rounded-xl bg-codex-elevated border-codex-border-strong shadow-[0_14px_36px_rgba(0,0,0,.5)]"
              >
                {OPEN_IN_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={opt.id === prefs.openIn}
                    onClick={() => {
                      updatePrefs({ openIn: opt.id });
                      setOpenInOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left text-[#e4e4e4] hover:bg-codex-hover ${
                      opt.id === prefs.openIn ? "bg-[#343434]" : ""
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label={t("agentEnv")} desc={t("agentEnvDesc")}>
          <div className="relative" ref={agentEnvRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={agentEnvOpen}
              onClick={() => {
                setAgentEnvOpen((v) => !v);
                setOpenInOpen(false);
                setShellOpen(false);
              }}
              className="inline-flex items-center gap-1.5 bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary hover:bg-codex-active whitespace-nowrap"
            >
              {AGENT_ENV_OPTIONS.find((o) => o.id === prefs.agentEnv)?.label}
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {agentEnvOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[260px] p-1.5 rounded-xl bg-codex-elevated border-codex-border-strong shadow-[0_14px_36px_rgba(0,0,0,.5)]"
              >
                {AGENT_ENV_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={opt.id === prefs.agentEnv}
                    onClick={() => {
                      updatePrefs({ agentEnv: opt.id });
                      setAgentEnvOpen(false);
                    }}
                    className="w-full flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-left hover:bg-codex-hover"
                  >
                    <span className="text-[13px] text-codex-text flex items-center gap-2 w-full">
                      {opt.label}
                      {opt.id === prefs.agentEnv && (
                        <span className="text-[12px] opacity-100">✓</span>
                      )}
                    </span>
                    {opt.desc && (
                      <span className="text-[11.5px] text-[#888]">{opt.desc}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label={t("integratedShell")} desc={t("integratedShellDesc")}>
          <div className="relative" ref={shellRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={shellOpen}
              onClick={() => {
                setShellOpen((v) => !v);
                setOpenInOpen(false);
              }}
              className="inline-flex items-center gap-1.5 bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary hover:bg-codex-active whitespace-nowrap"
            >
              {prefs.integratedShell}
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {shellOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[180px] p-1.5 rounded-xl bg-codex-elevated border-codex-border-strong shadow-[0_14px_36px_rgba(0,0,0,.5)]"
              >
                {shellOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={opt === prefs.integratedShell}
                    onClick={() => {
                      updatePrefs({ integratedShell: opt });
                      setShellOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg text-[13px] text-left text-codex-text hover:bg-codex-hover"
                  >
                    {opt}
                    <span className={`text-[12px] ${opt === prefs.integratedShell ? "opacity-100" : "opacity-0"}`}>✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label={t("language")} desc={t("languageDesc")}>
          <div className="relative" ref={langRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              onClick={() => {
                setLangOpen((v) => !v);
                setOpenInOpen(false);
                setShellOpen(false);
                setAgentEnvOpen(false);
              }}
              className="inline-flex items-center gap-1.5 bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary hover:bg-codex-active whitespace-nowrap"
            >
              {LANG_OPTIONS.find((o) => o.id === i18n.resolvedLanguage)?.label ?? t("autoDetect")}
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {langOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[160px] p-1.5 rounded-xl bg-codex-elevated border-codex-border-strong shadow-[0_14px_36px_rgba(0,0,0,.5)]"
              >
                {LANG_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={opt.id === i18n.resolvedLanguage}
                    onClick={async () => {
                      await i18n.changeLanguage(opt.id);
                      setLangOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg text-[13px] text-left text-codex-text hover:bg-codex-hover"
                  >
                    {opt.label}
                    <span className={`text-[12px] ${opt.id === i18n.resolvedLanguage ? "opacity-100" : "opacity-0"}`}>✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label={t("bottomPanel")} desc={t("bottomPanelDesc")}>
          <Toggle checked={prefs.bottomPanel} onChange={(v) => updatePrefs({ bottomPanel: v })} label={t("bottomPanel")} />
        </SettingsRow>
        <SettingsRow label={t("defaultTermPos")} desc={t("defaultTermPosDesc")}>
          <SegGroup
            value={prefs.terminalPosition}
            onChange={(v: string) => updatePrefs({ terminalPosition: v as "bottom" | "right" })}
            options={[
              { id: "bottom", label: t("termBottom") },
              { id: "right", label: t("termRight") },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t("pluginsToggle")} desc={t("pluginsToggleDesc")}>
          <Toggle checked={prefs.pluginsEnabled} onChange={(v) => updatePrefs({ pluginsEnabled: v })} label={t("pluginsToggle")} />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secEditor")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("plainEditor")} desc={t("plainEditorDesc")}>
          <Toggle checked={prefs.plainEditor} onChange={(v) => updatePrefs({ plainEditor: v })} label={t("plainEditor")} />
        </SettingsRow>
        <SettingsRow label={t("showContextUsage")}>
          <Toggle checked={prefs.showContextUsage} onChange={(v) => updatePrefs({ showContextUsage: v })} label={t("showContextUsage")} />
        </SettingsRow>
        <SettingsRow label={t("sendShortcut")} desc={t("sendShortcutDesc")}>
          <DropdownBtn>{t("pressEnter")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("followUpMode")} desc={t("followUpModeDesc")}>
          <SegGroup
            value={prefs.followUpMode}
            onChange={(v: string) => updatePrefs({ followUpMode: v as "queue" | "steer" })}
            options={[
              { id: "queue", label: t("queueFollowUp") },
              { id: "steer", label: t("steerFollowUp") },
            ]}
          />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secPopup")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("popupHotkey")} desc={t("popupHotkeyDesc")}>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-codex-text-secondary px-1.5 py-1 rounded-md hover:bg-codex-active"
            aria-label={t("editPopupHotkey")}
          >
            <span>{t("closed")}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="opacity-70">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
              />
            </svg>
          </button>
        </SettingsRow>
        <SettingsRow label={t("standaloneChat")} desc={t("standaloneChatDesc")}>
          <Toggle
            checked={prefs.standaloneChat}
            onChange={(v) => updatePrefs({ standaloneChat: v })}
            label={t("standaloneChat")}
          />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secNotifications")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("turnNotify")} desc={t("turnNotifyDesc")}>
          <div className="relative" ref={notifyRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={notifyOpen}
              onClick={() => {
                setNotifyOpen((v) => !v);
                setOpenInOpen(false);
                setShellOpen(false);
                setAgentEnvOpen(false);
                setLangOpen(false);
              }}
              className="inline-flex items-center gap-1.5 bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary hover:bg-codex-active whitespace-nowrap"
            >
              {NOTIFY_OPTIONS.find((o) => o.id === prefs.turnNotifyMode)?.label ?? t("notifyUnfocused")}
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {notifyOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[180px] p-1.5 rounded-xl bg-codex-elevated border-codex-border-strong shadow-[0_14px_36px_rgba(0,0,0,.5)]"
              >
                {NOTIFY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={opt.id === prefs.turnNotifyMode}
                    onClick={() => {
                      updatePrefs({ turnNotifyMode: opt.id });
                      setNotifyOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg text-[13px] text-left text-codex-text hover:bg-codex-hover"
                  >
                    {opt.label}
                    <span className={`text-[12px] ${opt.id === prefs.turnNotifyMode ? "opacity-100" : "opacity-0"}`}>✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label={t("permNotify")} desc={t("permNotifyDesc")}>
          <Toggle checked={prefs.permissionNotify} onChange={(v) => updatePrefs({ permissionNotify: v })} label={t("permNotify")} />
        </SettingsRow>
        <SettingsRow label={t("questionNotify")} desc={t("questionNotifyDesc")}>
          <Toggle
            checked={prefs.questionNotify}
            onChange={(v) => updatePrefs({ questionNotify: v })}
            label={t("questionNotify")}
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function AppearancePage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);
  // Local contrast state so a drag doesn't fire a PATCH per pixel; saved
  // (debounced) once the user settles.
  const [contrast, setContrast] = useState(prefs.contrast);
  const contrastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  useEffect(() => {
    setContrast(prefs.contrast);
  }, [prefs.contrast]);

  const onContrastChange = (value: number) => {
    setContrast(value);
    if (contrastTimer.current) clearTimeout(contrastTimer.current);
    contrastTimer.current = setTimeout(() => updatePrefs({ contrast: value }), 250);
  };
  useEffect(
    () => () => {
      if (contrastTimer.current) clearTimeout(contrastTimer.current);
    },
    [],
  );

  const themes = [
    { id: "system" as const, label: t("themeSystem"), bg: "linear-gradient(135deg,#1e1e1e 50%,#2a2a2a 50%)" },
    { id: "light" as const, label: t("themeLight"), bg: "linear-gradient(135deg,#f5f5f5 50%,#e8e8e8 50%)" },
    { id: "dark" as const, label: t("themeDark"), bg: "linear-gradient(135deg,#0d0d0d 50%,#1a1a1a 50%)" },
  ];

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("appearance")}</PageTitle>
      <PageSub>{t("appearanceDesc")}</PageSub>

      <SectionTitle>{t("theme")}</SectionTitle>
      <div className="flex gap-3 mb-4">
        {themes.map((th) => (
          <button
            key={th.id}
            type="button"
            onClick={() => updatePrefs({ theme: th.id })}
            className={`flex-1 rounded-xl border p-2 text-left transition ${
              prefs.theme === th.id ? "border-codex-border-strong bg-codex-active" : "border-codex-border bg-transparent hover:border-codex-border-strong"
            }`}
          >
            <div className="h-16 rounded-lg mb-2 grid place-items-center" style={{ background: th.bg }}>
              <span className="text-codex-muted text-xs">UI</span>
            </div>
            <div className="text-[12.5px] text-codex-text-secondary px-1">{th.label}</div>
          </button>
        ))}
      </div>

      <div
        className="mb-4 grid grid-cols-2 overflow-hidden rounded-[10px] border border-codex-border bg-[#141414] font-mono text-[12px] leading-[1.55] text-[#d4d4d4]"
        aria-label="Theme preview diff"
      >
        <ThemeDiffPane
          variant="del"
          lines={[
            { n: 1, code: <><Kw>const</Kw> <Id>themePreview</Id>: <Type>ThemeConfig</Type> {"= {"}</> },
            { n: 2, changed: true, code: <>{"  "}<Prop>surface</Prop>: <Str>&quot;sidebar&quot;</Str>,</> },
            { n: 3, changed: true, code: <>{"  "}<Prop>accent</Prop>: <Str>&quot;#2563eb&quot;</Str>,</> },
            { n: 4, changed: true, code: <>{"  "}<Prop>contrast</Prop>: <Num>42</Num>,</> },
            { n: 5, code: <>{"};"}</> },
          ]}
        />
        <ThemeDiffPane
          variant="add"
          border
          lines={[
            { n: 1, code: <><Kw>const</Kw> <Id>themePreview</Id>: <Type>ThemeConfig</Type> {"= {"}</> },
            { n: 2, changed: true, code: <>{"  "}<Prop>surface</Prop>: <Str>&quot;sidebar-elevated&quot;</Str>,</> },
            { n: 3, changed: true, code: <>{"  "}<Prop>accent</Prop>: <Str>&quot;#0ea5e9&quot;</Str>,</> },
            { n: 4, changed: true, code: <>{"  "}<Prop>contrast</Prop>: <Num>68</Num>,</> },
            { n: 5, code: <>{"};"}</> },
          ]}
        />
      </div>

      <SettingsCard>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <SectionTitle className="mb-0">{t("lightTheme")}</SectionTitle>
          <div className="flex gap-2 items-center">
            <ActionBtn>{t("importTheme")}</ActionBtn>
            <ActionBtn>{t("copyTheme")}</ActionBtn>
            <span className="text-[11px] text-[#666] bg-codex-elevated border-codex-border-strong rounded px-2 py-0.5">
              Codex
            </span>
          </div>
        </div>
        <SettingsRow label={t("accentColor")}>
          <div className="w-9 h-6 rounded bg-codex-accent border border-[#3a3a3a]" />
          <ActionBtn>{t("default")}</ActionBtn>
        </SettingsRow>
        <SettingsRow label={t("bgColor")}>
          <input
            defaultValue="#ffffff"
            className="bg-codex-surface border border-codex-border-strong rounded-md px-2.5 py-1 text-[12.5px] text-codex-text w-28 outline-none font-mono"
          />
        </SettingsRow>
        <SettingsRow label={t("fgColor")}>
          <input
            defaultValue="#1a1a1a"
            className="bg-codex-surface border border-codex-border-strong rounded-md px-2.5 py-1 text-[12.5px] text-codex-text w-28 outline-none font-mono"
          />
        </SettingsRow>
        <SettingsRow label={t("uiFont")}>
          <select className="bg-codex-elevated border-codex-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text-secondary">
            <option>{t("systemDefault")}</option>
          </select>
          <select className="bg-codex-elevated border-codex-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text-secondary min-w-[60px]">
            <option>{t("fontRegular")}</option>
          </select>
        </SettingsRow>
        <SettingsRow label={t("contentFont")}>
          <select className="bg-codex-elevated border-codex-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text-secondary">
            <option>{t("sameAsUiFont")}</option>
          </select>
          <select className="bg-codex-elevated border-codex-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text-secondary min-w-[60px]">
            <option>{t("fontRegular")}</option>
          </select>
        </SettingsRow>
        <SettingsRow label={t("codeFont")}>
          <select className="bg-codex-elevated border-codex-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text-secondary">
            <option>{t("systemDefault")}</option>
          </select>
          <select className="bg-codex-elevated border-codex-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text-secondary min-w-[60px]">
            <option>{t("fontRegular")}</option>
          </select>
        </SettingsRow>
        <SettingsRow label={t("translucentSidebar")}>
          <Toggle checked={prefs.translucentSidebar} onChange={(v) => updatePrefs({ translucentSidebar: v })} label={t("translucentSidebar")} />
        </SettingsRow>
        <SettingsRow label={t("contrast")}>
          <input
            type="range"
            min={0}
            max={100}
            value={contrast}
            onChange={(e) => onContrastChange(Number(e.target.value))}
            className="contrast-slider"
          />
          <span className="text-[12.5px] text-codex-muted w-6 text-right">{contrast}</span>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <SectionTitle className="mb-0">{t("darkTheme")}</SectionTitle>
          <div className="flex gap-2 items-center">
            <ActionBtn>{t("importTheme")}</ActionBtn>
            <ActionBtn>{t("copyTheme")}</ActionBtn>
            <span className="text-[11px] text-[#666] bg-codex-elevated border-codex-border-strong rounded px-2 py-0.5">
              Codex
            </span>
          </div>
        </div>
        <SettingsRow label={t("accentColor")}>
          <div className="w-9 h-6 rounded bg-codex-accent border border-[#3a3a3a]" />
          <ActionBtn>{t("default")}</ActionBtn>
        </SettingsRow>
        <SettingsRow label={t("translucentSidebar")}>
          <Toggle checked={prefs.translucentSidebar} onChange={(v) => updatePrefs({ translucentSidebar: v })} label={t("translucentSidebar")} />
        </SettingsRow>
        <SettingsRow label={t("contrast")}>
          <input
            type="range"
            min={0}
            max={100}
            value={contrast}
            onChange={(e) => onContrastChange(Number(e.target.value))}
            className="contrast-slider"
          />
          <span className="text-[12.5px] text-codex-muted w-6 text-right">{contrast}</span>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function AgentConfigPage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("agent")}</PageTitle>
      <PageSub>{t("agentDesc")}</PageSub>

      <SettingsCard>
        <div className="px-4 pt-4">
          <SectionTitle>{t("agentDefaults")}</SectionTitle>
        </div>
        <div className="flex items-center justify-end px-4 pb-2">
          <button type="button" className="text-[12.5px] text-codex-accent hover:underline">
            {t("openConfigToml")}
          </button>
        </div>
        <SettingsRow label={t("approvalPolicy")} desc={t("approvalPolicyDesc")}>
          <DropdownBtn>{t("neverAsk")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("sandbox")} desc={t("sandboxDesc")}>
          <DropdownBtn>{t("fullAccess")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("webSearch")} desc={t("webSearchDesc")}>
          <Toggle checked={prefs.webSearch} onChange={(v) => updatePrefs({ webSearch: v })} label={t("webSearch")} />
        </SettingsRow>
        <SettingsRow label={t("verbosity")} desc={t("verbosityDesc")}>
          <DropdownBtn>{t("modelDefault")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("reasoningSummary")} desc={t("reasoningSummaryDesc")}>
          <DropdownBtn>{t("auto")}</DropdownBtn>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="px-4 pt-4">
          <SectionTitle>{t("modelFeatures")}</SectionTitle>
        </div>
        <SettingsRow label={t("effortLevels")} desc={t("effortLevelsDesc")}>
          <span className="text-[12px] text-[#9eb6ff] bg-[#2a3548] border border-[#3a4a66] rounded-full px-2.5 py-0.5">
            {t("selectedN", { n: 6 })}
          </span>
        </SettingsRow>
        <SettingsRow label={t("ultraInPicker")} desc={t("ultraInPickerDesc")}>
          <Toggle checked={prefs.ultraInPicker} onChange={(v) => updatePrefs({ ultraInPicker: v })} label={t("ultraInPicker")} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="px-4 pt-4">
          <SectionTitle>{t("workspaceDeps")}</SectionTitle>
        </div>
        <SettingsRow label={t("codexDeps")} desc={t("codexDepsDesc")}>
          <Toggle checked={prefs.workspaceDeps} onChange={(v) => updatePrefs({ workspaceDeps: v })} label={t("codexDeps")} />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

type DiffLine = { n: number; changed?: boolean; code: ReactNode };

function ThemeDiffPane({
  lines,
  variant,
  border,
}: {
  lines: DiffLine[];
  variant: "del" | "add";
  border?: boolean;
}) {
  const changedBg = variant === "del" ? "bg-red-500/10" : "bg-green-500/10";
  const bar = variant === "del" ? "before:bg-red-500" : "before:bg-green-500";
  return (
    <div className={`min-w-0 flex flex-col ${border ? "border-l border-codex-border" : ""}`}>
      <div className="flex-1 pt-2.5 pb-1 overflow-x-auto">
        {lines.map((line) => (
          <div
            key={line.n}
            className={`grid grid-cols-[28px_1fr] min-h-5 ${line.changed ? changedBg : ""}`}
          >
            <span className="text-[#555] text-right pr-2 pl-1.5 select-none tabular-nums">{line.n}</span>
            <span
              className={`relative px-3 whitespace-pre overflow-hidden text-ellipsis ${
                line.changed ? `before:content-[''] before:absolute before:left-0 before:inset-y-0 before:w-[3px] ${bar}` : ""
              }`}
            >
              {line.code}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2.5 px-2.5 pb-2 pt-1.5 text-[#555]" aria-hidden>
        <ChevronLeft size={12} className="opacity-70" />
        <ChevronRight size={12} className="opacity-70" />
      </div>
    </div>
  );
}

function Kw({ children }: { children: ReactNode }) {
  return <span className="text-[#7c9cff]">{children}</span>;
}
function Id({ children }: { children: ReactNode }) {
  return <span className="text-[#e8b86d]">{children}</span>;
}
function Type({ children }: { children: ReactNode }) {
  return <span className="text-[#c4b5fd]">{children}</span>;
}
function Prop({ children }: { children: ReactNode }) {
  return <span className="text-[#e8b86d]">{children}</span>;
}
function Str({ children }: { children: ReactNode }) {
  return <span className="text-[#86efac]">{children}</span>;
}
function Num({ children }: { children: ReactNode }) {
  return <span className="text-[#7dd3fc]">{children}</span>;
}
