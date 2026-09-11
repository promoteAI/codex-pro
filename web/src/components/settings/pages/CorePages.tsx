import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const [defaultPerm, setDefaultPerm] = useState(true);
  const [fullAccess, setFullAccess] = useState(true);
  const [bottomPanel, setBottomPanel] = useState(true);
  const [termPos, setTermPos] = useState<"bottom" | "right">("bottom");
  const [plugins, setPlugins] = useState(true);
  const [plainEditor, setPlainEditor] = useState(false);
  const [contextUsage, setContextUsage] = useState(false);
  const [followUp, setFollowUp] = useState<"queue" | "steer">("queue");
  const [standaloneChat, setStandaloneChat] = useState(false);
  const [permNotify, setPermNotify] = useState(true);
  const [questionNotify, setQuestionNotify] = useState(true);
  const [openIn, setOpenIn] = useState("vscode");
  const [openInOpen, setOpenInOpen] = useState(false);
  const openInRef = useRef<HTMLDivElement>(null);
  const openInOpt = OPEN_IN_OPTIONS.find((o) => o.id === openIn) ?? OPEN_IN_OPTIONS[0];
  const [shell, setShell] = useState("PowerShell");
  const [shellOpen, setShellOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const shellOptions = ["PowerShell", "Command Prompt", "Git Bash", "WSL"];

  useEffect(() => {
    if (!openInOpen && !shellOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (openInOpen && !openInRef.current?.contains(t)) setOpenInOpen(false);
      if (shellOpen && !shellRef.current?.contains(t)) setShellOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenInOpen(false);
        setShellOpen(false);
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
            checked={defaultPerm}
            onChange={setDefaultPerm}
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
          <Toggle checked={fullAccess} onChange={setFullAccess} label={t("fullAccessPerm")} />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secGeneral")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("noProjectFolder")} desc={t("noProjectFolderDesc")}>
          <span className="text-[12.5px] text-[#a8a8a8] font-mono max-w-[280px] truncate">
            C:\Users\cheris\Documents\Codex
          </span>
          <ActionBtn>{t("change")}</ActionBtn>
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
              className="inline-flex items-center gap-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0] hover:bg-[#323232] whitespace-nowrap"
            >
              {openInOpt.icon}
              {openInOpt.label}
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {openInOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[196px] p-1.5 rounded-xl bg-[#2a2a2a] border border-[#3a3a3a] shadow-[0_14px_36px_rgba(0,0,0,.5)]"
              >
                {OPEN_IN_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={opt.id === openIn}
                    onClick={() => {
                      setOpenIn(opt.id);
                      setOpenInOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left text-[#e4e4e4] hover:bg-[#343434] ${
                      opt.id === openIn ? "bg-[#343434]" : ""
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
          <DropdownBtn>{t("windowsNative")}</DropdownBtn>
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
              className="inline-flex items-center gap-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0] hover:bg-[#323232] whitespace-nowrap"
            >
              {shell}
              <span className="text-[10px] opacity-70">▾</span>
            </button>
            {shellOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[180px] p-1.5 rounded-xl bg-[#2a2a2a] border border-[#3a3a3a] shadow-[0_14px_36px_rgba(0,0,0,.5)]"
              >
                {shellOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={opt === shell}
                    onClick={() => {
                      setShell(opt);
                      setShellOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-4 px-3 py-2 rounded-lg text-[13px] text-left text-[#e8e8e8] hover:bg-[#343434]"
                  >
                    {opt}
                    <span className={`text-[12px] ${opt === shell ? "opacity-100" : "opacity-0"}`}>✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label={t("language")} desc={t("languageDesc")}>
          <DropdownBtn>{t("autoDetect")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("bottomPanel")} desc={t("bottomPanelDesc")}>
          <Toggle checked={bottomPanel} onChange={setBottomPanel} label={t("bottomPanel")} />
        </SettingsRow>
        <SettingsRow label={t("defaultTermPos")} desc={t("defaultTermPosDesc")}>
          <SegGroup
            value={termPos}
            onChange={(v: string) => setTermPos(v as "bottom" | "right")}
            options={[
              { id: "bottom", label: t("termBottom") },
              { id: "right", label: t("termRight") },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t("pluginsToggle")} desc={t("pluginsToggleDesc")}>
          <Toggle checked={plugins} onChange={setPlugins} label={t("pluginsToggle")} />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secEditor")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("plainEditor")} desc={t("plainEditorDesc")}>
          <Toggle checked={plainEditor} onChange={setPlainEditor} label={t("plainEditor")} />
        </SettingsRow>
        <SettingsRow label={t("showContextUsage")}>
          <Toggle checked={contextUsage} onChange={setContextUsage} label={t("showContextUsage")} />
        </SettingsRow>
        <SettingsRow label={t("sendShortcut")} desc={t("sendShortcutDesc")}>
          <DropdownBtn>{t("pressEnter")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("followUpMode")} desc={t("followUpModeDesc")}>
          <SegGroup
            value={followUp}
            onChange={(v: string) => setFollowUp(v as "queue" | "steer")}
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
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c8c8c8] px-1.5 py-1 rounded-md hover:bg-[#2a2a2a]"
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
            checked={standaloneChat}
            onChange={setStandaloneChat}
            label={t("standaloneChat")}
          />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secNotifications")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("turnNotify")} desc={t("turnNotifyDesc")}>
          <DropdownBtn>{t("notifyUnfocused")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("permNotify")} desc={t("permNotifyDesc")}>
          <Toggle checked={permNotify} onChange={setPermNotify} label={t("permNotify")} />
        </SettingsRow>
        <SettingsRow label={t("questionNotify")} desc={t("questionNotifyDesc")}>
          <Toggle
            checked={questionNotify}
            onChange={setQuestionNotify}
            label={t("questionNotify")}
          />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function AppearancePage() {
  const { t } = useTranslation("settings");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("dark");
  const [contrast, setContrast] = useState(45);
  const [translucent, setTranslucent] = useState(true);

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
            onClick={() => setTheme(th.id)}
            className={`flex-1 rounded-xl border p-2 text-left transition ${
              theme === th.id ? "border-[#555] bg-[#222]" : "border-codex-border bg-transparent hover:border-[#3a3a3a]"
            }`}
          >
            <div className="h-16 rounded-lg mb-2 grid place-items-center" style={{ background: th.bg }}>
              <span className="text-[#666] text-xs">UI</span>
            </div>
            <div className="text-[12.5px] text-[#c8c8c8] px-1">{th.label}</div>
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
          <SectionTitle className="mb-0">{t("darkTheme")}</SectionTitle>
          <div className="flex gap-2 items-center">
            <ActionBtn>{t("importTheme")}</ActionBtn>
            <ActionBtn>{t("copyTheme")}</ActionBtn>
            <span className="text-[11px] text-[#666] bg-[#2a2a2a] border border-[#3a3a3a] rounded px-2 py-0.5">
              Codex
            </span>
          </div>
        </div>
        <SettingsRow label={t("accentColor")}>
          <div className="w-9 h-6 rounded bg-codex-accent border border-[#3a3a3a]" />
          <ActionBtn>{t("default")}</ActionBtn>
        </SettingsRow>
        <SettingsRow label={t("translucentSidebar")}>
          <Toggle checked={translucent} onChange={setTranslucent} label={t("translucentSidebar")} />
        </SettingsRow>
        <SettingsRow label={t("contrast")}>
          <input
            type="range"
            min={0}
            max={100}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
            className="w-32 accent-codex-accent"
          />
          <span className="text-[12.5px] text-[#999] w-6 text-right">{contrast}</span>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function AgentConfigPage() {
  const { t } = useTranslation("settings");
  const [ultra, setUltra] = useState(false);
  const [deps, setDeps] = useState(true);
  const [webSearch, setWebSearch] = useState(true);

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
          <Toggle checked={webSearch} onChange={setWebSearch} label={t("webSearch")} />
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
          <Toggle checked={ultra} onChange={setUltra} label={t("ultraInPicker")} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <div className="px-4 pt-4">
          <SectionTitle>{t("workspaceDeps")}</SectionTitle>
        </div>
        <SettingsRow label={t("codexDeps")} desc={t("codexDepsDesc")}>
          <Toggle checked={deps} onChange={setDeps} label={t("codexDeps")} />
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
