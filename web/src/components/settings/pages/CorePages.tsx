import { useState } from "react";
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

export function GeneralPage() {
  const { t, i18n } = useTranslation("settings");
  const [launch, setLaunch] = useState(false);
  const [notify, setNotify] = useState(true);
  const [enterSend, setEnterSend] = useState(true);
  const [telemetry, setTelemetry] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(true);

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("general")}</PageTitle>
      <PageSub>{t("generalDesc")}</PageSub>

      <SectionTitle>{t("secApp")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("language")} desc={t("languageDesc")}>
          <SegGroup
            value={i18n.resolvedLanguage === "zh" ? "zh" : "en"}
            onChange={(lng: string) => i18n.changeLanguage(lng)}
            options={[
              { id: "zh", label: "中文" },
              { id: "en", label: "EN" },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t("launchAtLogin")} desc={t("launchAtLoginDesc")}>
          <Toggle checked={launch} onChange={setLaunch} label={t("launchAtLogin")} />
        </SettingsRow>
        <SettingsRow label={t("openOnStart")} desc={t("openOnStartDesc")}>
          <DropdownBtn>{t("openHome")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("notifications")} desc={t("notificationsDesc")}>
          <Toggle checked={notify} onChange={setNotify} label={t("notifications")} />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secNewChat")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("defaultProject")} desc={t("defaultProjectDesc")}>
          <DropdownBtn>{t("lastProject")}</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("defaultModel")} desc={t("defaultModelDesc")}>
          <DropdownBtn>5.6 Luna · 中</DropdownBtn>
        </SettingsRow>
        <SettingsRow label={t("enterToSend")} desc={t("enterToSendDesc")}>
          <Toggle checked={enterSend} onChange={setEnterSend} label={t("enterToSend")} />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("secPrivacy")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("telemetry")} desc={t("telemetryDesc")}>
          <Toggle checked={telemetry} onChange={setTelemetry} label={t("telemetry")} />
        </SettingsRow>
        <SettingsRow label={t("autoUpdate")} desc={t("autoUpdateDesc")}>
          <Toggle checked={autoUpdate} onChange={setAutoUpdate} label={t("autoUpdate")} />
        </SettingsRow>
        <SettingsRow label={t("checkUpdate")} desc={t("checkUpdateDesc")}>
          <ActionBtn>{t("checkUpdate")}</ActionBtn>
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

      <div className="font-mono text-[11.5px] text-[#888] bg-[#1a1a1a] border border-codex-border rounded-lg px-3 py-2 mb-4 overflow-x-auto whitespace-nowrap">
        <span>const themePreview: ThemeConfig = {"{"}</span>
        <span className="text-orange-400"> surface:</span>
        <span className="text-sky-300">&quot;sidebar-aligned&quot;</span>,
        <span className="text-orange-400"> accent:</span>
        <span className="text-sky-300">&quot;#3866f0&quot;</span>,
        <span className="text-orange-400"> contrast:</span>
        <span className="text-sky-300">{contrast}</span>
        <span> {"}"}</span>
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

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("agent")}</PageTitle>
      <PageSub>{t("agentDesc")}</PageSub>

      <SettingsCard>
        <div className="px-4 pt-4">
          <SectionTitle>{t("agentDefaults")}</SectionTitle>
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <DropdownBtn>{t("userConfig")}</DropdownBtn>
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
          <DropdownBtn>{t("realtime")}</DropdownBtn>
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
