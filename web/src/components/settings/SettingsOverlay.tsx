import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useShellStore, type SettingsSection } from "../../stores/shell";
import { BackChevron, SearchIcon, SETTINGS_ICONS } from "./icons";
import { GeneralPage, AppearancePage, AgentConfigPage } from "./pages/CorePages";
import { ModelsPage, ImportPage } from "./pages/ModelsImport";
import {
  VoicePage,
  PersonalizationPage,
  ShortcutsPage,
  AccountPage,
  ComputerPage,
  SettingsPluginsPage,
  BrowserSettingsPage,
  HooksPage,
  GitPage,
  ConnectionsPage,
  EnvironmentPage,
  WorktreesPage,
  ArchivedPage,
} from "./pages/MorePages";

const Overview = lazy(() => import("../../pages/Overview").then((m) => ({ default: m.Overview })));
const Memory = lazy(() => import("../../pages/Memory").then((m) => ({ default: m.Memory })));
const Channels = lazy(() => import("../../pages/Channels").then((m) => ({ default: m.Channels })));
const KanbanPage = lazy(() => import("../../pages/Kanban").then((m) => ({ default: m.Kanban })));
const Logs = lazy(() => import("../../pages/Logs").then((m) => ({ default: m.Logs })));
const Analytics = lazy(() => import("../../pages/Analytics").then((m) => ({ default: m.Analytics })));
const Knowledge = lazy(() => import("../../pages/Knowledge").then((m) => ({ default: m.Knowledge })));
const Sessions = lazy(() => import("../../pages/Sessions").then((m) => ({ default: m.Sessions })));
const Config = lazy(() => import("../../pages/Config").then((m) => ({ default: m.Config })));

type NavGroup = "personal" | "integrations" | "coding" | "archived" | "admin";

/** Prototype settings-nav only (19 items). Extra admin pages stay reachable via deep link. */
const SECTIONS: Array<{ id: SettingsSection; group: NavGroup }> = [
  { id: "general", group: "personal" },
  { id: "models", group: "personal" },
  { id: "import", group: "personal" },
  { id: "appearance", group: "personal" },
  { id: "voice", group: "personal" },
  { id: "agent", group: "personal" },
  { id: "personalization", group: "personal" },
  { id: "shortcuts", group: "personal" },
  { id: "account", group: "personal" },
  { id: "computer", group: "integrations" },
  { id: "connections", group: "integrations" },
  { id: "plugins", group: "integrations" },
  { id: "browser", group: "integrations" },
  { id: "hooks", group: "coding" },
  { id: "git", group: "coding" },
  { id: "worktrees", group: "coding" },
  { id: "archived", group: "archived" },
  { id: "memory", group: "admin" },
  { id: "knowledge", group: "admin" },
  { id: "analytics", group: "admin" },
];

const GROUPS: NavGroup[] = ["personal", "integrations", "coding", "archived", "admin"];

const PROTO_PAGES: Partial<Record<SettingsSection, ComponentType>> = {
  general: GeneralPage,
  models: ModelsPage,
  import: ImportPage,
  appearance: AppearancePage,
  voice: VoicePage,
  agent: AgentConfigPage,
  personalization: PersonalizationPage,
  shortcuts: ShortcutsPage,
  account: AccountPage,
  computer: ComputerPage,
  connections: ConnectionsPage,
  plugins: SettingsPluginsPage,
  browser: BrowserSettingsPage,
  hooks: HooksPage,
  git: GitPage,
  worktrees: WorktreesPage,
  archived: ArchivedPage,
  environment: EnvironmentPage,
};

const ADMIN_PAGES: Partial<Record<SettingsSection, ComponentType>> = {
  memory: Memory,
  knowledge: Knowledge,
  analytics: Analytics,
  // Deep-link only (not in prototype settings-nav)
  config: Config,
  overview: Overview,
  sessions: Sessions,
  channels: Channels,
  kanban: KanbanPage,
  logs: Logs,
};

const ADMIN_SUB: Partial<Record<SettingsSection, string>> = {
  memory: "adminMemoryDesc",
  knowledge: "adminKnowledgeDesc",
  analytics: "adminAnalyticsDesc",
  config: "adminConfigDesc",
  overview: "adminOverviewDesc",
  sessions: "adminSessionsDesc",
  channels: "adminChannelsDesc",
  kanban: "adminKanbanDesc",
  logs: "adminLogsDesc",
};

const NAV_IDS = new Set(SECTIONS.map((s) => s.id));
const SECTION_IDS = new Set<SettingsSection>([
  ...SECTIONS.map((s) => s.id),
  "config",
  "overview",
  "sessions",
  "channels",
  "kanban",
  "logs",
  "environment",
  "connections",
]);

export function SettingsOverlay() {
  const { t } = useTranslation("settings");
  const open = useShellStore((s) => s.settingsOpen);
  const section = useShellStore((s) => s.settingsSection);
  const closeSettings = useShellStore((s) => s.closeSettings);
  const setSettingsSection = useShellStore((s) => s.setSettingsSection);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const s = searchParams.get("settings") as SettingsSection | null;
    if (s && SECTION_IDS.has(s)) {
      useShellStore.getState().openSettings(s);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!open) return;
    if (searchParams.get("settings") === section) return;
    const next = new URLSearchParams(searchParams);
    next.set("settings", section);
    setSearchParams(next, { replace: true });
  }, [open, section, searchParams, setSearchParams]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeSettings();
      if (searchParams.has("settings")) {
        const next = new URLSearchParams(searchParams);
        next.delete("settings");
        setSearchParams(next, { replace: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSettings, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => t(s.id).toLowerCase().includes(q));
  }, [filter, t]);

  if (!open) return null;

  const close = () => {
    closeSettings();
    if (searchParams.has("settings")) {
      const next = new URLSearchParams(searchParams);
      next.delete("settings");
      setSearchParams(next, { replace: true });
    }
  };

  const ProtoPage = PROTO_PAGES[section];
  const AdminPage = ADMIN_PAGES[section];
  const adminSubKey = ADMIN_SUB[section];
  const showAdminChrome = NAV_IDS.has(section) && !!AdminPage;

  return (
    <div
      id="settingsPanel"
      className="absolute inset-0 z-20 flex bg-codex-bg"
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
      <aside className="settings-sidebar w-[220px] shrink-0 border-r border-codex-border flex flex-col bg-codex-sidebar">
        <button
          type="button"
          onClick={close}
          className="flex items-center gap-1.5 px-4 py-3 text-[13px] text-codex-muted border-b border-codex-border hover:bg-codex-hover hover:text-codex-text-secondary"
        >
          <BackChevron />
          {t("back")}
        </button>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-codex-border">
          <SearchIcon />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="bg-transparent outline-none text-[12.5px] text-codex-text-secondary placeholder:text-codex-muted w-full py-0.5"
          />
        </div>
        <nav className="settings-nav flex-1 overflow-y-auto py-2">
          {GROUPS.map((group) => {
            const items = filtered.filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="px-4 pt-2 pb-1 text-[11px] text-codex-muted font-medium tracking-[0.04em]">
                  {t(`group.${group}`)}
                </div>
                {items.map(({ id }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSettingsSection(id)}
                    className={`w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 pl-4 pr-3 py-[7px] rounded-[5px] text-[13px] relative my-px ${
                      section === id
                        ? "bg-codex-active text-codex-text font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-sm before:bg-codex-text"
                        : "text-codex-text-secondary hover:bg-codex-hover hover:text-codex-text"
                    }`}
                  >
                    {SETTINGS_ICONS[id]}
                    {t(id)}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="settings-content w-full flex-1 min-w-0 min-h-0 overflow-auto flex flex-col">
        {ProtoPage && (
          <div className="overflow-auto" style={{ margin: "50px 100px 20px", maxHeight: '100%' }}>
            <ProtoPage />
          </div>
        )}
        {AdminPage && (
          <div className="overflow-auto" style={{ margin: "50px 100px 20px", maxHeight: '100%' }}>
            {showAdminChrome || !NAV_IDS.has(section) ? (
              <>
                <h2 className="text-[22px] font-semibold text-codex-text tracking-tight m-0 mb-1.5">{t(section)}</h2>
                {adminSubKey && (
                  <p className="text-[12.5px] text-codex-muted leading-relaxed m-0 mb-5 max-w-[560px]">{t(adminSubKey)}</p>
                )}
              </>
            ) : null}
            <div className="codex-admin-pane w-full">
              <Suspense fallback={<div className="text-codex-muted text-sm p-2">{t("loading")}</div>}>
                <AdminPage />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
