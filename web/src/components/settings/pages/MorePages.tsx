import { useEffect, useMemo, useRef, useState, } from "react";
import { createPortal } from "react-dom";
import { Search, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  ActionBtn,
  EmptyState,
  PageSub,
  PageTitle,
  SectionTitle,
  SegGroup,
  SettingsCard,
  SettingsRow,
  Toggle,
} from "../ui";
import { AddMarketModal } from "../../AddMarketModal";
import { McpCreateView } from "../../McpCreateView";
import { SkillDetailDrawer } from "../../SkillDetailDrawer";
import { toast } from "../../../stores/toast";
import { useShellStore } from "../../../stores/shell";
import { useSettingsStore } from "../../../stores/settings";
import { useWsSubscribe } from "../../../hooks/use-ws";
import { useApi } from "../../../hooks/use-api";
import { apiFetch } from "../../../lib/api";
import { useIsAdmin } from "../../../stores/capabilities";
import { dateTime } from "../../../lib/datetime";

interface ApiPlugin {
  name: string;
  version: string;
  description: string;
  source: string;
  path: string | null;
  status: string;
  provides_tools: string[];
  provides_hooks: string[];
  depends_on: string[];
}

type AuthMethod = "none" | "identity" | "password";

interface SshConnection {
  name: string;
  host: string;
  port: number;
  user: string;
  auth_method: AuthMethod;
  identity_file: string;
  has_password: boolean;
  created_at?: string;
  updated_at?: string;
}

export function VoicePage() {
  const { t } = useTranslation("settings");
  return (
    <div className="min-w-0">
      <PageTitle>{t("voice")}</PageTitle>
      <PageSub>{t("voiceDesc")}</PageSub>
      <SectionTitle>{t("secApp")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("microphone")} desc={t("microphoneDesc")}>
          <select className="bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary">
            <option>{t("systemDefault")}</option>
          </select>
        </SettingsRow>
      </SettingsCard>
      <SectionTitle>{t("voiceChat")}</SectionTitle>
      <SettingsCard>
        <SettingsRow
          label={<span className="text-orange-400">{t("voiceUnavailable")}</span>}
          desc={t("voiceUnavailableDesc")}
        />
      </SettingsCard>
      <SectionTitle>{t("dictation")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("holdDictation")} desc={t("holdDictationDesc")}>
          <span className="text-[12.5px] text-codex-muted">{t("off")}</span>
        </SettingsRow>
        <SettingsRow label={t("toggleDictation")} desc={t("toggleDictationDesc")}>
          <span className="text-[12.5px] text-codex-muted">{t("off")}</span>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard>
        <SettingsRow label={t("dictationDict")} desc={t("dictationDictDesc")}>
          <ActionBtn>+ {t("addEntry")}</ActionBtn>
        </SettingsRow>
        <div className="flex items-center justify-between px-4 py-3 border-t border-codex-border">
          <div className="text-[13px] text-codex-text-secondary bg-codex-surface border border-[#333] rounded-md px-3 py-1.5 flex-1 mr-3">
            Jane Doe
          </div>
          <button type="button" className="text-[#666] hover:text-codex-danger text-sm">
            ×
          </button>
        </div>
      </SettingsCard>
    </div>
  );
}

export function PersonalizationPage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);
  const [text, setText] = useState(prefs.codexInstructions);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  useEffect(() => {
    setText(prefs.codexInstructions);
  }, [prefs.codexInstructions]);

  const saveInstructions = () => updatePrefs({ codexInstructions: text });

  return (
    <div className="min-w-0">
      <PageTitle>{t("personalization")}</PageTitle>

      <div className="bg-codex-surface border border-codex-border rounded-xl p-4 mb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[14px] font-medium text-codex-text mb-1">{t("codexInstructions")}</div>
            <div className="text-xs text-codex-muted">{t("codexInstructionsDesc")}</div>
          </div>
          <ActionBtn onClick={saveInstructions}>{t("save")}</ActionBtn>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveInstructions}
          rows={5}
          className="w-full bg-codex-surface border border-[#333] rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-[#555] resize-y min-h-[100px]"
          placeholder={t("instructionsPlaceholder")}
        />
      </div>

      <div className="bg-codex-surface border border-codex-border rounded-xl p-4 mb-5">
        <div className="text-[14px] font-medium text-codex-text mb-1">{t("memory")}</div>
        <div className="text-xs text-codex-muted mb-3">{t("memorySettingsDesc")}</div>
        <SettingsCard className="mb-0 border-0 bg-[#1e1e1e]">
          <SettingsRow label={t("localMemory")} desc={t("localMemoryDesc")}>
            <Toggle checked={prefs.localMemory} onChange={(v) => updatePrefs({ localMemory: v })} label={t("localMemory")} />
          </SettingsRow>
          <SettingsRow label={t("toolMemory")} desc={t("toolMemoryDesc")}>
            <Toggle checked={prefs.toolMemory} onChange={(v) => updatePrefs({ toolMemory: v })} label={t("toolMemory")} />
          </SettingsRow>
          <SettingsRow label={t("deleteLocalMemory")} desc={t("deleteLocalMemoryDesc")}>
            <ActionBtn danger>{t("delete")}</ActionBtn>
          </SettingsRow>
        </SettingsCard>
      </div>
    </div>
  );
}

const PETS = [
  { id: "codex", name: "Codex", desc: "The original Codex companion", color: "#4f8cff" },
  { id: "dewy", name: "Dewy", desc: "A calm companion that goes with the flow", color: "#4fc3f7" },
  { id: "fireball", name: "Fireball", desc: "A fiery friend with lots of energy", color: "#ff6b2c" },
];

export function PetsPage() {
  const { t } = useTranslation("settings");
  const [selected, setSelected] = useState("codex");

  return (
    <div className="min-w-0">
      <PageTitle>{t("pets")}</PageTitle>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <SectionTitle className="mb-1">{t("choosePet")}</SectionTitle>
          <p className="text-xs text-codex-muted max-w-md">{t("choosePetDesc")}</p>
        </div>
        <div className="flex gap-2">
          <ActionBtn>
            <span className="inline-flex items-center gap-1">
              <Plus size={12} /> {t("create")}
            </span>
          </ActionBtn>
          <ActionBtn>{t("manageCustomPets")}</ActionBtn>
        </div>
      </div>
      <div className="space-y-2">
        {PETS.map((pet) => (
          <div
            key={pet.id}
            className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl border ${
              selected === pet.id ? "bg-codex-active border-codex-border-strong" : "bg-codex-surface border-codex-border"
            }`}
          >
            <div
              className="w-10 h-10 rounded-lg shrink-0"
              style={{ background: `linear-gradient(135deg, ${pet.color}, #1a1a1a)` }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium text-codex-text">{pet.name}</div>
              <div className="text-xs text-codex-muted">{pet.desc}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(pet.id)}
              className={`px-3 py-1 rounded-md text-[12.5px] border ${
                selected === pet.id
                  ? "bg-[#2a3a2a] border-[#3a5a3a] text-codex-success"
                  : "bg-[#2a2a2a] border-[#3a3a3a] text-codex-text-secondary hover:bg-[#323232]"
              }`}
            >
              {selected === pet.id ? t("selected") : t("select")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const SHORTCUTS = [
  { id: "search", action: "打开命令菜单", keys: ["Ctrl+K"] },
  { id: "settings", action: "设置", keys: ["Ctrl+,"] },
  { id: "analytics", action: "使用统计", keys: ["Alt+Win+P"] },
  { id: "new", action: "新建对话", keys: ["Ctrl+N"] },
  { id: "term", action: "打开终端", keys: ["Ctrl+`"] },
  { id: "sidebar", action: "切换侧边栏", keys: ["Ctrl+B"] },
  { id: "bottom", action: "切换底部面板", keys: ["Ctrl+J"] },
  { id: "review", action: "切换审阅", keys: ["Ctrl+Shift+G"] },
  { id: "browser", action: "打开浏览器", keys: ["Ctrl+T"] },
  { id: "sidechat", action: "切换侧边聊天", keys: ["Ctrl+Alt+S"] },
  { id: "model", action: "打开模型选择器", keys: ["Ctrl+Shift+M"] },
  { id: "folder", action: "打开文件夹", keys: ["Ctrl+O"] },
  { id: "send", action: "发送消息", keys: ["Enter"] },
  { id: "queue", action: "在后台发送消息", keys: ["Ctrl+Enter"] },
  { id: "copy-md", action: "复制为 Markdown", keys: [] },
  { id: "rename", action: "重命名聊天", keys: ["Ctrl+Alt+R"] },
  { id: "show-keys", action: "显示键盘快捷键", keys: ["Ctrl+/"] },
  { id: "env1", action: "环境操作 1", keys: ["Shift+Win+D"] },
  { id: "env2", action: "环境操作 2", keys: [] },
  { id: "env3", action: "环境操作 3", keys: [] },
];

export function ShortcutsPage() {
  const { t } = useTranslation("settings");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return SHORTCUTS;
    return SHORTCUTS.filter(
      (s) => s.action.toLowerCase().includes(needle) || s.keys.join(" ").toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <div className="min-w-0">
      <PageTitle>{t("shortcuts")}</PageTitle>
      <div className="flex items-center gap-2 bg-[#1e1e1e] border border-codex-border rounded-lg px-3 py-2 mb-4">
        <Search size={14} className="text-[#555] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchShortcuts")}
          className="bg-transparent outline-none text-[13px] text-codex-text-secondary placeholder:text-codex-muted w-full"
        />
      </div>
      <div className="space-y-1">
        {list.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-codex-hover"
            role="listitem"
          >
            <span className="text-[13.5px] text-codex-text-secondary">{s.action}</span>
            <div className="flex gap-1 shrink-0">
              {s.keys.length === 0 ? (
                <span className="text-[11.5px] text-[#666]">{t("shortcutUnset")}</span>
              ) : (
                s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="text-[11.5px] text-codex-muted bg-codex-elevated border-codex-border-strong rounded px-1.5 py-0.5"
                  >
                    {k}
                  </kbd>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountPage() {
  const { t } = useTranslation("settings");
  return (
    <div className="min-w-0">
      <PageTitle>{t("account")}</PageTitle>
      <div className="flex items-center gap-4 bg-codex-surface border border-codex-border rounded-xl px-4 py-4 mb-5">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4a6cf7] to-[#7c5cff] grid place-items-center text-lg font-semibold text-white shrink-0">
          C
        </div>
        <div>
          <div className="text-[15px] font-semibold text-codex-text">custom</div>
          <div className="text-[12.5px] text-codex-muted">custom@example.com</div>
          <div className="inline-flex mt-2 px-2.5 py-0.5 rounded-full bg-[#2a3548] border border-[#3a4a66] text-[11.5px] text-[#9eb6ff]">
            CodexPro
          </div>
        </div>
      </div>

      <SectionTitle>{t("billing")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("manageSub")} desc={t("manageSubDesc")}>
          <button type="button" className="text-[12.5px] text-[#4c8dff] hover:underline">
            {t("openAccount")} ↗
          </button>
        </SettingsRow>
        <SettingsRow label={t("receipts")} desc={t("receiptsDesc")}>
          <ActionBtn>{t("getReceipts")}</ActionBtn>
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("session")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("signOut")} desc={t("signOutDesc")}>
          <ActionBtn>{t("signOut")}</ActionBtn>
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("data")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("resetLocal")} desc={t("resetLocalDesc")}>
          <ActionBtn danger>{t("reset")}</ActionBtn>
        </SettingsRow>
        <SettingsRow label={t("deleteAccount")} desc={t("deleteAccountDesc")}>
          <ActionBtn danger>{t("deleteAccount")}</ActionBtn>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function ComputerPage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  return (
    <div className="min-w-0">
      <PageTitle>{t("computer")}</PageTitle>
      <PageSub>{t("computerDesc")}</PageSub>
      <SectionTitle>{t("control")}</SectionTitle>
      <SettingsCard>
        <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-codex-border">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#5b8def] to-[#7c5cff] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-codex-text">{t("anyScreen")}</div>
            <div className="text-xs text-codex-muted">{t("anyScreenDesc")}</div>
          </div>
          <Toggle checked={prefs.allowAnyScreen} onChange={(v) => updatePrefs({ allowAnyScreen: v })} label={t("anyScreen")} />
        </div>
        <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-codex-border">
          <div className="w-9 h-9 rounded-lg bg-white shrink-0 grid place-items-center text-[#4285F4] text-xs font-bold">
            G
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-codex-text">Google Chrome</div>
            <div className="text-xs text-codex-muted">{t("chromeConnected")}</div>
          </div>
          <ActionBtn>{t("manage")}</ActionBtn>
          <Toggle checked={prefs.chromeEnabled} onChange={(v) => updatePrefs({ chromeEnabled: v })} label="Chrome" />
        </div>
        <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-codex-border">
          <div className="w-9 h-9 rounded-lg bg-[#0a2a4a] shrink-0 grid place-items-center text-[#36c5f0] text-xs font-bold">
            E
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-codex-text">Microsoft Edge</div>
            <div className="text-xs text-codex-muted">{t("edgeDisconnected")}</div>
          </div>
          <ActionBtn>{t("install")}</ActionBtn>
        </div>
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#107c41] shrink-0 grid place-items-center text-white text-xs font-bold">
            X
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-codex-text">Microsoft Excel</div>
            <div className="text-xs text-codex-muted">{t("excelDesc")}</div>
          </div>
          <Toggle checked={prefs.excelEnabled} onChange={(v) => updatePrefs({ excelEnabled: v })} label="Excel" />
        </div>
      </SettingsCard>
      <SectionTitle>{t("alwaysAllowApps")}</SectionTitle>
      <div className="bg-codex-panel border border-codex-border rounded-xl px-4 py-6 text-center text-[13px] text-codex-muted">
        {t("alwaysAllowEmpty")}
      </div>
    </div>
  );
}

type PluginKind = "plugins" | "mcp" | "skills";

interface PluginListItem {
  id: string;
  name: string;
  desc: string;
  kind: PluginKind;
  tag: string;
  on: boolean;
}

function pluginKind(p: ApiPlugin): PluginKind {
  if (p.provides_tools.length > 0) return "mcp";
  if (p.provides_hooks.length > 0) return "skills";
  return "plugins";
}

function pluginTag(p: ApiPlugin): string {
  if (p.source === "entrypoint") return "系统";
  if (p.source === "user") return "用户";
  if (p.source === "project") return "项目";
  return "插件";
}

function skillTag(source: string): string {
  if (source === "builtin") return "系统";
  if (source === "external") return "外部推荐";
  return "个人";
}

export function SettingsPluginsPage() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const closeSettings = useShellStore((s) => s.closeSettings);
  const isAdmin = useIsAdmin();
  const canAdmin = isAdmin !== false;
  const [tab, setTab] = useState<PluginKind>("plugins");
  const [q, setQ] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [creatingMcp, setCreatingMcp] = useState(false);
  const [apiPlugins, setApiPlugins] = useState<ApiPlugin[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  // Per-item dropdown for … menu. key = item id.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const { data: skillsApiData, refetch: refetchSkills } = useApi<{
    skills: { name: string; description: string; enabled: boolean; source?: string }[];
  }>("/skills");

  const loadPlugins = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ plugins: ApiPlugin[] }>("/plugins");
      setApiPlugins(data.plugins);
      // Merge, don't replace: a skill may not appear in /plugins at all, and
      // replacing wiped its key so it rendered as "off" even when enabled.
      setEnabled((prev) => {
        const next = { ...prev };
        for (const p of data.plugins) {
          next[p.name] = p.status !== "disabled";
        }
        return next;
      });
      // Refresh skills so the merge effect below re-applies each skill's own
      // enabled flag (ws skill_changed also routes through here).
      void refetchSkills();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlugins();
  }, []);

  // The plugin list's `status` only reflects the plugin system's allow/deny
  // lists. A skill can be enabled/disabled independently in the skills store,
  // and may not even appear in /plugins — so merge each skill's own `enabled`
  // flag in, otherwise an enabled skill still renders as a grey "off" toggle.
  useEffect(() => {
    if (!skillsApiData) return;
    setEnabled((prev) => {
      const next = { ...prev };
      for (const s of skillsApiData.skills) {
        next[s.name] = s.enabled;
      }
      return next;
    });
  }, [skillsApiData]);

  useWsSubscribe(["plugins"], loadPlugins, ["plugin_changed"]);
  useWsSubscribe(["skills"], loadPlugins, ["skill_changed"]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addMenuOpen]);

  // Close per-item menu when clicking outside.
  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuId(menuId === id ? null : id);
    setMenuRect(menuId === id ? null : rect);
  };

  const openItemAction = async (_id: string, action: "open" | "details") => {
    setMenuId(null);
    if (action === "open") {
      // For skills, open inline drawer inside settings panel
      const item = allItems.find((p) => p.id === _id);
      if (item?.kind === "skills") {
        setSelectedSkill(_id);
        return;
      }
      closeSettings();
      navigate("/plugins");
    } else {
      const item = allItems.find((p) => p.id === _id);
      if (item?.kind === "skills") {
        setSelectedSkill(_id);
        return;
      }
      toast.info("详情页面待实现");
    }
  };

  const togglePlugin = async (item: PluginListItem, enable: boolean) => {
    setToggling(item.id);
    const kind = item.kind;
    try {
      // Skills toggle via the skills store (flip semantics), plugins via the
      // plugin allow/deny config. A name present in both lists is treated as a
      // skill here, matching how the detail drawer opens for skill rows.
      if (kind === "skills") {
        await apiFetch(`/skills/${encodeURIComponent(item.id)}/toggle`, {
          method: "POST",
          body: JSON.stringify({ enabled: enable }),
        });
      } else {
        await apiFetch(`/plugins/${encodeURIComponent(item.id)}/toggle`, {
          method: "POST",
          body: JSON.stringify({ enabled: enable }),
        });
      }
      setEnabled((s) => ({ ...s, [item.id]: enable }));
      toast.success(enable ? `「${item.id}」已启用` : `「${item.id}」已禁用`);
    } catch (e: unknown) {
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setToggling(null);
    }
  };

  const skillsList = skillsApiData?.skills ?? [];
  const skillMap = new Map(skillsList.map((s) => [s.name.toLowerCase(), s]));

  const allItems = useMemo<PluginListItem[]>(() => {
    const items: PluginListItem[] = [];
    for (const p of apiPlugins) {
      items.push({
        id: p.name,
        name: p.name,
        desc: p.description,
        kind: pluginKind(p),
        tag: pluginTag(p),
        on: p.status !== "disabled",
      });
    }
    for (const s of skillsList) {
      if (!skillMap.has(s.name.toLowerCase())) continue;
      // Already added via apiPlugins if it matches; skip duplicates.
      const found = items.find((i) => i.id.toLowerCase() === s.name.toLowerCase());
      if (found) {
        found.kind = "skills";
        found.on = s.enabled;
        found.tag = skillTag(s.source ?? "");
      } else {
        items.push({
          id: s.name,
          name: s.name,
          desc: s.description || "",
          kind: "skills",
          tag: skillTag(s.source ?? ""),
          on: s.enabled,
        });
      }
    }
    return items;
  }, [apiPlugins, skillsList, skillMap]);

  const filtered = allItems.filter((p) => {
    if (p.kind !== tab) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.desc.toLowerCase().includes(q.toLowerCase())) {
      return false;
    }
    return true;
  });

  const pluginCount = allItems.filter((p) => p.kind === "plugins").length;
  const mcpCount = allItems.filter((p) => p.kind === "mcp").length;
  const skillCount = allItems.filter((p) => p.kind === "skills").length;

  const browseCatalog = () => {
    closeSettings();
    navigate("/plugins");
  };

  if (creatingMcp) {
    return (
      <McpCreateView
        onCancel={() => setCreatingMcp(false)}
        onSaved={(name) => {
          const id = name.toLowerCase().replace(/\s+/g, "-");
          setEnabled((s) => ({ ...s, [id]: true }));
          setCreatingMcp(false);
          setTab("mcp");
        }}
      />
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <PageTitle>{t("plugins")}</PageTitle>
          <PageSub>{t("pluginsDesc")}</PageSub>
        </div>
        <div className="flex gap-2.5 shrink-0 items-start">
          <ActionBtn onClick={browseCatalog}>{t("browseCatalog")}</ActionBtn>
          <div className="relative" ref={addMenuRef}>
            <button
              type="button"
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              className="px-3.5 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[13px] font-medium hover:bg-[#f2f2f2]"
            >
              {t("add")} ▾
            </button>
            {addMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[200px] p-1.5 bg-codex-elevated border-codex-border-strong rounded-[10px] shadow-[0_12px_32px_rgba(0,0,0,.45)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false);
                    toast.info(t("createPlugin") + "（即将推出）");
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-codex-text hover:bg-[#353535]"
                >
                  <span className="w-4 h-4 inline-flex items-center justify-center text-codex-muted">
                    <Plus size={14} />
                  </span>
                  {t("createPlugin")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setMarketOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-codex-text hover:bg-[#353535]"
                >
                  <span className="w-4 h-4 inline-flex items-center justify-center text-codex-muted">
                    <Plus size={14} />
                  </span>
                  {t("addMarketplace")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setCreatingMcp(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-codex-text hover:bg-[#353535]"
                >
                  <span className="w-4 h-4 inline-flex items-center justify-center text-codex-muted">
                    <Plus size={14} />
                  </span>
                  {t("addMcp")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2 pb-3 border-b border-codex-border mb-1">
        {(
          [
            ["plugins", `${t("plugins")} ${pluginCount}`],
            ["mcp", `MCP ${mcpCount}`],
            ["skills", `${t("skillsTab")} ${skillCount}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`text-[13px] pb-1 border-b-[1.5px] -mb-px ${
              tab === id
                ? "text-codex-text border-[#e0e0e0]"
                : "text-codex-muted border-transparent hover:text-codex-text-secondary"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 bg-[#1e1e1e] border border-codex-border rounded-lg px-2.5 py-1 w-[200px]">
          <Search size={14} className="text-[#555]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchSkills")}
            className="bg-transparent outline-none text-[12.5px] text-codex-text-secondary w-full placeholder:text-codex-muted"
          />
        </div>
      </div>

      {loading && (
        <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 24 }}>加载中…</div>
      )}
      {!loading && error && (
        <div style={{ color: "#e85d5d", fontSize: 13, textAlign: "center", padding: 24 }}>
          加载失败：{error}
        </div>
      )}

      {!loading && !error && (
      <div className="pt-4 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            title={tab === "skills" ? t("noSkills") : t("plugins")}
            desc={tab === "skills" ? t("noSkillsDesc") : t("pluginsDesc")}
          />
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3.5 px-4 py-3.5 bg-[#1e1e1e] border border-[#262626] rounded-[10px] hover:border-[#333] cursor-pointer"
              onClick={() => p.kind === "skills" && setSelectedSkill(p.id)}
            >
              <div className="w-9 h-9 rounded-lg bg-[#252525] grid place-items-center text-codex-muted shrink-0 text-xs">
                ◆
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-codex-text-secondary mb-0.5">{p.name}</div>
                <div className="text-xs text-codex-muted line-clamp-2">{p.desc}</div>
              </div>
              <span className="text-xs text-[#666] px-2 py-0.5 bg-[#252525] rounded shrink-0">{p.tag}</span>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()} title={toggling === p.id ? undefined : (enabled[p.id] ? "已启用" : "启用")}>
                <Toggle
                  checked={!!enabled[p.id]}
                  disabled={toggling === p.id}
                  onChange={(v) => togglePlugin(p, v)}
                  label={toggling === p.id ? "…" : (enabled[p.id] ? "已启用" : "启用")}
                />
              </div>
              <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => toggleMenu(e, p.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-[#888] hover:bg-[#2a2a2a] hover:text-codex-text-secondary transition-colors"
                  aria-label="更多操作"
                  title="更多操作"
                >
                  ···
                </button>
              </div>
              {menuId === p.id && menuRect && createPortal(
                <div
                  ref={menuRef}
                  role="menu"
                  className="fixed z-50 min-w-[120px] p-1.5 bg-codex-elevated border border-codex-border-strong rounded-[8px] shadow-[0_8px_24px_rgba(0,0,0,.4)]"
                  style={{
                    left: menuRect.right + 4,
                    top: menuRect.bottom + 4,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openItemAction(p.id, "open")}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[13px] text-codex-text hover:bg-[#353535]"
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openItemAction(p.id, "details")}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[13px] text-codex-text hover:bg-[#353535]"
                  >
                    详情
                  </button>
                </div>,
                document.body,
              )}
            </div>
          ))
        )}
      </div>
      )}

      <AddMarketModal open={marketOpen} onClose={() => setMarketOpen(false)} />
      {selectedSkill && (
        <SkillDetailDrawer
          name={selectedSkill}
          canAdmin={canAdmin}
          onClose={() => setSelectedSkill(null)}
        />
      )}

      <AddMarketModal open={marketOpen} onClose={() => setMarketOpen(false)} />
    </div>
  );
}

export function BrowserSettingsPage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  return (
    <div className="min-w-0">
      <PageTitle>{t("browser")}</PageTitle>
      <SettingsCard>
        <SettingsRow label={t("embeddedBrowser")} desc={t("embeddedBrowserDesc")}>
          <Toggle checked={prefs.embeddedBrowser} onChange={(v) => updatePrefs({ embeddedBrowser: v })} label={t("embeddedBrowser")} />
        </SettingsRow>
      </SettingsCard>
      <SectionTitle>{t("browserSecurity")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("ignoreCert")} desc={t("ignoreCertDesc")}>
          <Toggle checked={prefs.ignoreCert} onChange={(v) => updatePrefs({ ignoreCert: v })} label={t("ignoreCert")} />
        </SettingsRow>
      </SettingsCard>
      <SectionTitle>{t("browserData")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("clearBrowserCache")} desc={t("clearBrowserCacheDesc")}>
          <ActionBtn>{t("clearCache")}</ActionBtn>
        </SettingsRow>
        <SettingsRow label={t("clearAllBrowserData")} desc={t("clearAllBrowserDataDesc")}>
          <ActionBtn danger>{t("clearAll")}</ActionBtn>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "PermissionRequest",
  "Stop",
  "SessionStart",
  "SessionEnd",
] as const;

const HOOK_SCOPES = ["用户", "codex-pro", "default"] as const;

interface ApiHook {
  id: string;
  name: string;
  event: string;
  run_mode: string;
  scope: string;
  command: string;
  enabled: boolean;
}

export function HooksPage() {
  const { t } = useTranslation(["settings", "common"]);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState("用户");
  const [event, setEvent] = useState("PreToolUse");
  const [runMode, setRunMode] = useState("process");
  const [command, setCommand] = useState("");

  const { data, loading, error, refetch } = useApi<{
    hooks: ApiHook[];
    total: number;
    enabled: number;
  }>("/hooks");

  const hooks = data?.hooks ?? [];

  const filtered = hooks.filter((h) => {
    if (scope !== "用户" && h.scope !== scope) return false;
    if (q && !h.event.toLowerCase().includes(q.toLowerCase())
      && !h.command.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const enabledCount = hooks.filter((h) => h.enabled).length;

  const saveHook = async () => {
    setSaving(true);
    try {
      await apiFetch("/hooks", {
        method: "POST",
        body: JSON.stringify({ event, run_mode: runMode, scope, command }),
      });
      toast.success(t("saveSuccess"));
      setCommand("");
      setCreating(false);
      await refetch();
    } catch (e: unknown) {
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleHook = async (h: ApiHook, enable: boolean) => {
    try {
      await apiFetch(`/hooks/${encodeURIComponent(h.id)}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled: enable }),
      });
      toast.success(
        enable ? `钩子「${h.event}」${t("enabled")}` : `钩子「${h.event}」${t("disabled")}`,
      );
      await refetch();
    } catch (e: unknown) {
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deleteHook = async (h: ApiHook) => {
    try {
      await apiFetch(`/hooks/${encodeURIComponent(h.id)}`, { method: "DELETE" });
      toast.success(t("deleteSuccess"));
      await refetch();
    } catch (e: unknown) {
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (creating) {
    return (
      <div className="min-w-0">
        <PageTitle>{t("newHook")}</PageTitle>
        <PageSub>{t("newHookDesc")}</PageSub>
        <SettingsCard>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3.5 border-b border-codex-border">
            <label className="block text-[12px] text-codex-muted">
              {t("hookEvent")}
              <select
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                className="mt-1.5 w-full bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary"
              >
                {HOOK_EVENTS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] text-codex-muted">
              {t("hookRunMode")}
              <select
                value={runMode}
                onChange={(e) => setRunMode(e.target.value)}
                className="mt-1.5 w-full bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary"
              >
                <option value="process">{t("hookRunProcess")}</option>
                <option value="prompt">{t("hookRunPrompt")}</option>
              </select>
            </label>
            <label className="block text-[12px] text-codex-muted">
              {t("hookScope")}
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="mt-1.5 w-full bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary"
              >
                {HOOK_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s === "用户" ? t("scopeUser") : s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="px-4 py-3.5">
            <label className="block text-[12px] text-codex-muted mb-1.5">{t("hookCommand")}</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={4}
              placeholder={t("hookCommandPlaceholder")}
              className="w-full bg-codex-surface border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-codex-text outline-none resize-y font-mono"
            />
          </div>
        </SettingsCard>
        <div className="flex justify-end gap-2 mt-4">
          <ActionBtn onClick={() => setCreating(false)} disabled={saving}>
            {t("common:cancel")}
          </ActionBtn>
          <button
            type="button"
            onClick={saveHook}
            disabled={saving || !command.trim()}
            className="px-3 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[12.5px] font-medium disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {t("save")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <PageTitle>{t("hooks")}</PageTitle>
      <PageSub>
        {t("hooksDesc")}{" "}
        <a href="#" className="text-[#4c8dff] hover:underline">
          {t("learnMore")}
        </a>
      </PageSub>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="bg-codex-elevated border-codex-border-strong rounded-md px-3 py-1.5 text-[12.5px] text-codex-text-secondary"
          aria-label={t("hookScope")}
        >
          {HOOK_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s === "用户" ? t("scopeUser") : s}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] text-codex-muted">{t("hooksCount", { n: hooks.length })}</span>
        <div className="ml-auto flex items-center gap-1.5 bg-[#1e1e1e] border border-codex-border rounded-lg px-2.5 py-1 w-[200px]">
          <Search size={14} className="text-[#555]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchHooks")}
            className="bg-transparent outline-none text-[12.5px] text-codex-text-secondary w-full"
          />
        </div>
      </div>
      <div className="flex items-center justify-between mb-6">
        <span className="text-[12.5px] text-codex-muted">{t("installedN", { n: enabledCount })}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={t("refresh")}
            aria-label={t("refresh")}
            onClick={() => void refetch()}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-codex-text-secondary hover:bg-[#333]"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M21 12a9 9 0 1 1-2.6-6.3" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[12.5px] font-medium"
          >
            + {t("new")}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[12.5px] text-red-400 mb-3">{error}</div>
      )}

      {loading && hooks.length === 0 && (
        <div className="text-[12.5px] text-codex-muted">{t("loading")}</div>
      )}

      {!loading && hooks.length === 0 && (
        <EmptyState
          title={t("noHooks")}
          desc={t("noHooksDesc")}
          action={
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="px-3 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[12.5px] font-medium"
            >
              + {t("newHook")}
            </button>
          }
        />
      )}

      {hooks.length > 0 && (
        <SettingsCard>
          {filtered.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-codex-border last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13.5px] font-medium text-codex-text">{h.event}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-codex-elevated border-codex-border-strong text-codex-muted">
                    {h.run_mode === "prompt" ? t("hookRunPrompt") : t("hookRunProcess")}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-codex-elevated border-codex-border-strong text-codex-muted">
                    {h.scope === "用户" ? t("scopeUser") : h.scope}
                  </span>
                </div>
                <div className="text-xs text-codex-muted font-mono truncate">{h.command}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  title={t("delete")}
                  aria-label={`${t("delete")} ${h.event}`}
                  onClick={() => void deleteHook(h)}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-codex-text-secondary hover:bg-[#3a2a2a] hover:text-[#f87171]"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
                <Toggle
                  checked={h.enabled}
                  onChange={(v) => void toggleHook(h, v)}
                  label={`${t("enabled")} ${h.event}`}
                />
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[12.5px] text-codex-muted">
              {t("noHooksDesc")}
            </div>
          )}
        </SettingsCard>
      )}
    </div>
  );
}

export function ConnectionsPage() {
  const { t } = useTranslation("settings");
  const [connections, setConnections] = useState<SshConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SshConnection | null>(null);
  const [saving, setSaving] = useState(false);
  // Form state
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [user, setUser] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("none");
  const [identityFile, setIdentityFile] = useState("");
  const [password, setPassword] = useState("");

  const loadConnections = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ connections: SshConnection[] }>("/connections");
      setConnections(data.connections);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadConnections(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName(""); setHost(""); setPort("22"); setUser("");
    setAuthMethod("none"); setIdentityFile(""); setPassword("");
    setCreating(true);
  };

  const openEdit = (c: SshConnection) => {
    setEditing(c);
    setName(c.name); setHost(c.host); setPort(String(c.port));
    setUser(c.user ?? ""); setAuthMethod(c.auth_method);
    setIdentityFile(c.identity_file); setPassword("");
    setCreating(true);
  };

  const closeCreate = () => {
    setCreating(false);
    setEditing(null);
  };

  const saveConnection = async () => {
    if (!name.trim() || !host.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), host: host.trim(), port: Number(port) || 22, user: user.trim(), authMethod, identityFile: identityFile.trim() || undefined, password: password || undefined };
      if (editing) {
        await apiFetch(`/connections/${encodeURIComponent(editing.name)}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/connections", { method: "POST", body: JSON.stringify(payload) });
      }
      toast.success(t("connectionSaved"));
      closeCreate();
      await loadConnections();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteConnection = async (name: string) => {
    if (!window.confirm(t("deleteConfirm", { name }))) return;
    try {
      await apiFetch(`/connections/${encodeURIComponent(name)}`, { method: "DELETE" });
      toast.success(t("connectionDeleted"));
      await loadConnections();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-codex-text">{t("sshConnections")}</h1>
          <p className="text-[12px] text-codex-muted mt-0.5">{t("connectionsDesc")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="pl-btn-primary flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          {t("addConnection")}
        </button>
      </div>

      {loading && <div className="text-center text-codex-muted py-8 text-sm">{t("loading")}</div>}
      {error && <div className="text-center text-red-400 py-8 text-sm">{error}</div>}
      {!loading && !error && connections.length === 0 && (
        <div className="text-center py-12 text-codex-muted">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-30"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <div className="text-sm">{t("noConnections")}</div>
        </div>
      )}

      {!loading && !error && connections.map((conn, i) => (
        <div key={conn.name} className={`pl-conn-card${i > 0 ? " pl-conn-card--bordered" : ""}`}>
          <div className="pl-conn-card__head">
            <div className="pl-conn-card__icon" style={{ background: `hsl(${(conn.name.charCodeAt(0) * 37) % 360}, 50%, 45%)` }}>
              <span>{conn.name[0].toUpperCase()}</span>
            </div>
            <div className="pl-conn-card__info">
              <div className="pl-conn-card__name">{conn.name}</div>
              <div className="pl-conn-card__host">
                {conn.user && <span className="pl-conn-card__user">{conn.user}@</span>}
                {conn.host}:{conn.port}
              </div>
            </div>
            <span className={`pl-conn-badge ${conn.auth_method === "password" ? "pl-conn-badge--ok" : "pl-conn-badge--warn"}`}>
              {conn.auth_method === "password" ? (t("connected") as string) : (t("unknown") as string)}
            </span>
          </div>
          <div className="pl-conn-card__foot">
            <span className="pl-conn-card__id">{conn.host}</span>
            <div className="pl-conn-card__actions">
              <button type="button" onClick={() => openEdit(conn)} className="pl-conn-act">{t("edit")}</button>
              <button type="button" onClick={() => void deleteConnection(conn.name)} className="pl-conn-act pl-conn-act--danger">{t("delete")}</button>
            </div>
          </div>
        </div>
      ))}

      {/* Create/Edit Dialog */}
      {creating && (
        <div className="pl-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeCreate(); }}>
          <div className="pl-modal">
            <div className="pl-modal-head">
              <h3 className="pl-modal-title">{editing ? t("editConnection") : t("addConnection")}</h3>
              <button type="button" className="pl-modal-close" onClick={closeCreate} aria-label={t("close")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
            <div className="pl-modal-body">
              <label className="pl-modal-label">
                {t("displayName")}
                <input className="pl-modal-input" value={name} onChange={(e) => setName(e.target.value)} disabled={!!editing} placeholder={t("displayNamePlaceholder")} spellCheck={false} autoComplete="off" />
              </label>
              <label className="pl-modal-label">
                {t("host")}
                <input className="pl-modal-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder={t("hostPlaceholder")} spellCheck={false} autoComplete="off" />
              </label>
              <div className="pl-modal-row">
                <label className="pl-modal-label pl-modal-label--half">
                  {t("port")}
                  <input className="pl-modal-input" value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" spellCheck={false} autoComplete="off" />
                </label>
                <label className="pl-modal-label pl-modal-label--half">
                  {t("user")}
                  <input className="pl-modal-input" value={user} onChange={(e) => setUser(e.target.value)} spellCheck={false} autoComplete="off" />
                </label>
              </div>
              <label className="pl-modal-label">
                {t("authMethod")}
                <select className="pl-modal-input" value={authMethod} onChange={(e) => setAuthMethod(e.target.value as "none" | "identity" | "password")}>
                  <option value="none">{t("authNone")}</option>
                  <option value="identity">{t("authIdentity")}</option>
                  <option value="password">{t("authPassword")}</option>
                </select>
              </label>
              {authMethod === "identity" && (
                <label className="pl-modal-label">
                  {t("identityFile")}
                  <input className="pl-modal-input" value={identityFile} onChange={(e) => setIdentityFile(e.target.value)} placeholder={t("identityPlaceholder")} spellCheck={false} autoComplete="off" />
                </label>
              )}
              {authMethod === "password" && (
                <label className="pl-modal-label">
                  {t("password")}
                  <input className="pl-modal-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("passwordPlaceholder")} autoComplete="new-password" />
                </label>
              )}
            </div>
            <div className="pl-modal-foot">
              <button type="button" className="pl-modal-cancel" onClick={closeCreate}>{t("cancel")}</button>
              <button type="button" className="pl-btn-primary" onClick={saveConnection} disabled={saving || !name.trim() || !host.trim()}>
                {saving ? t("saving") : editing ? t("save") : t("add")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GitPage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);
  // Text fields are held locally so keystrokes don't PATCH; committed on blur.
  const [prefix, setPrefix] = useState(prefs.gitBranchPrefix);
  const [monitorInstr, setMonitorInstr] = useState(prefs.gitMonitorInstr);
  const [commitInstr, setCommitInstr] = useState(prefs.gitCommitInstr);
  const [prInstr, setPrInstr] = useState(prefs.gitPrInstr);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  useEffect(() => {
    setPrefix(prefs.gitBranchPrefix);
    setMonitorInstr(prefs.gitMonitorInstr);
    setCommitInstr(prefs.gitCommitInstr);
    setPrInstr(prefs.gitPrInstr);
  }, [
    prefs.gitBranchPrefix,
    prefs.gitMonitorInstr,
    prefs.gitCommitInstr,
    prefs.gitPrInstr,
  ]);

  return (
    <div className="min-w-0">
      <PageTitle>{t("git")}</PageTitle>
      <SettingsCard>
        <SettingsRow label={t("branchPrefix")} desc={t("branchPrefixDesc")}>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onBlur={() => updatePrefs({ gitBranchPrefix: prefix })}
            className="bg-codex-surface border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text w-36 outline-none"
          />
        </SettingsRow>
        <SettingsRow label={t("prMergeMethod")} desc={t("prMergeMethodDesc")}>
          <SegGroup
            value={prefs.gitMergeMethod}
            onChange={(v: string) => updatePrefs({ gitMergeMethod: v as "merge" | "squash" })}
            options={[
              { id: "merge", label: t("merge") },
              { id: "squash", label: t("squash") },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t("forcePush")} desc={t("forcePushDesc")}>
          <Toggle checked={prefs.gitForcePush} onChange={(v) => updatePrefs({ gitForcePush: v })} label={t("forcePush")} />
        </SettingsRow>
        <SettingsRow label={t("draftPr")} desc={t("draftPrDesc")}>
          <Toggle checked={prefs.gitDraftPr} onChange={(v) => updatePrefs({ gitDraftPr: v })} label={t("draftPr")} />
        </SettingsRow>
        <SettingsRow label={t("reviewPresentation")} desc={t("reviewPresentationDesc")}>
          <SegGroup
            value={prefs.gitReviewPresentation}
            onChange={(v: string) => updatePrefs({ gitReviewPresentation: v as "inline" | "separate" })}
            options={[
              { id: "inline", label: t("reviewInline") },
              { id: "separate", label: t("reviewSeparate") },
            ]}
          />
        </SettingsRow>
      </SettingsCard>

      <SectionTitle>{t("monitorPr")}</SectionTitle>
      <SettingsCard>
        <div className="px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13.5px] font-medium text-codex-text-secondary">{t("autoMergeWhenReady")}</div>
              <div className="text-[12px] text-codex-muted mt-1">{t("autoMergeWhenReadyDesc")}</div>
            </div>
            <Toggle checked={prefs.gitAutoMerge} onChange={(v) => updatePrefs({ gitAutoMerge: v })} label={t("autoMergeWhenReady")} />
          </div>
          <textarea
            value={monitorInstr}
            onChange={(e) => setMonitorInstr(e.target.value)}
            onBlur={() => updatePrefs({ gitMonitorInstr: monitorInstr })}
            rows={3}
            placeholder={t("monitorInstrPlaceholder")}
            className="w-full bg-codex-surface border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-codex-text outline-none resize-y"
            aria-label={t("monitorInstrPlaceholder")}
          />
        </div>
      </SettingsCard>

      <SectionTitle>{t("commitInstr")}</SectionTitle>
      <SettingsCard>
        <div className="px-4 py-3.5 space-y-2">
          <div className="text-[12px] text-codex-muted">{t("commitInstrDesc")}</div>
          <textarea
            value={commitInstr}
            onChange={(e) => setCommitInstr(e.target.value)}
            onBlur={() => updatePrefs({ gitCommitInstr: commitInstr })}
            rows={3}
            placeholder={t("commitInstrPlaceholder")}
            className="w-full bg-codex-surface border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-codex-text outline-none resize-y"
          />
        </div>
      </SettingsCard>

      <SectionTitle>{t("prInstr")}</SectionTitle>
      <SettingsCard>
        <div className="px-4 py-3.5 space-y-2">
          <div className="text-[12px] text-codex-muted">{t("prInstrDesc")}</div>
          <textarea
            value={prInstr}
            onChange={(e) => setPrInstr(e.target.value)}
            onBlur={() => updatePrefs({ gitPrInstr: prInstr })}
            rows={3}
            placeholder={t("prInstrPlaceholder")}
            className="w-full bg-codex-surface border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-codex-text outline-none resize-y"
          />
        </div>
      </SettingsCard>
    </div>
  );
}

export function EnvironmentPage() {
  const { t } = useTranslation("settings");
  const [selected, setSelected] = useState("m-askdb");
  const projects = [
    { id: "codex-pro", name: "codex-pro", sub: "promptsAI" },
    { id: "DeepTutor", name: "DeepTutor", sub: "promptsAI" },
    { id: "m-askdb", name: "m-askdb", sub: "x-ai" },
  ];

  return (
    <div className="min-w-0">
      <PageTitle>{t("environment")}</PageTitle>
      <PageSub>{t("environmentDesc")}</PageSub>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12.5px] text-codex-text-secondary">{t("chooseProject")}</span>
        <ActionBtn>{t("addProject")}</ActionBtn>
      </div>
      <div className="space-y-1.5">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left ${
              selected === p.id
                ? "bg-codex-active border-codex-border-strong"
                : "bg-codex-surface border-codex-border hover:border-codex-border-strong"
            }`}
          >
            <span
              className={`w-4 h-4 rounded border grid place-items-center text-[10px] ${
                selected === p.id ? "border-codex-accent bg-codex-accent text-white" : "border-[#444]"
              }`}
            >
              {selected === p.id ? "✓" : ""}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-codex-text">{p.name}</div>
              <div className="text-xs text-codex-muted">{p.sub}</div>
            </div>
            <span className="text-[#666] text-lg leading-none">+</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WorktreesPage() {
  const { t } = useTranslation("settings");
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.updatePrefs);
  // Text/number inputs are held locally so typing doesn't PATCH per keystroke.
  const [root, setRoot] = useState(prefs.worktreeRoot);
  const [deleteLimit, setDeleteLimit] = useState(prefs.worktreeDeleteLimit);

  useEffect(() => {
    void useSettingsStore.getState().loadPrefs();
  }, []);

  useEffect(() => {
    setRoot(prefs.worktreeRoot);
    setDeleteLimit(prefs.worktreeDeleteLimit);
  }, [prefs.worktreeRoot, prefs.worktreeDeleteLimit]);

  return (
    <div className="min-w-0">
      <PageTitle>{t("worktrees")}</PageTitle>
      <SettingsCard>
        <SettingsRow label={t("worktreeRoot")} desc={t("worktreeRootDesc")}>
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            onBlur={() => updatePrefs({ worktreeRoot: root })}
            className="bg-codex-surface border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text w-[280px] max-w-[40vw] outline-none"
          />
        </SettingsRow>
        <SettingsRow label={t("pullUpstream")} desc={t("pullUpstreamDesc")}>
          <Toggle checked={prefs.worktreePullUpstream} onChange={(v) => updatePrefs({ worktreePullUpstream: v })} label={t("pullUpstream")} />
        </SettingsRow>
        <SettingsRow label={t("autoDeleteWorktrees")} desc={t("autoDeleteWorktreesDesc")}>
          <Toggle checked={prefs.worktreeAutoDelete} onChange={(v) => updatePrefs({ worktreeAutoDelete: v })} label={t("autoDeleteWorktrees")} />
        </SettingsRow>
        <SettingsRow label={t("autoDeleteLimit")} desc={t("autoDeleteLimitDesc")}>
          <input
            type="number"
            min={1}
            max={999}
            value={deleteLimit}
            onChange={(e) => setDeleteLimit(Number(e.target.value) || 1)}
            onBlur={() => updatePrefs({ worktreeDeleteLimit: deleteLimit })}
            className="bg-codex-surface border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] text-codex-text w-20 outline-none"
            aria-label={t("autoDeleteLimit")}
          />
        </SettingsRow>
      </SettingsCard>
      <div className="flex items-center justify-between mt-5 mb-2">
        <span className="text-[12.5px] text-codex-text-secondary">{t("noWorktreesYet")}</span>
        <button
          type="button"
          title={t("refresh")}
          aria-label={t("refresh")}
          className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-codex-text-secondary hover:bg-[#333]"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M21 12a9 9 0 1 1-2.6-6.3" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
      <div className="bg-codex-panel border border-codex-border rounded-xl px-4 py-8 text-center text-[13px] text-codex-muted">
        {t("worktreesEmpty")}
      </div>
    </div>
  );
}

type ArchivedChat = { key: string; title: string; time: string };
type ArchivedGroup = { project: string; chats: ArchivedChat[] };

interface ArchivedSession {
  key: string;
  title?: string;
  project?: string;
  updated_at?: string;
  created_at?: string;
  status?: string;
}

const NO_PROJECT = "__no_project__";

export function ArchivedPage() {
  const { t } = useTranslation("settings");
  const [groups, setGroups] = useState<ArchivedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [chatFilter, setChatFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ sessions: ArchivedSession[] }>("/sessions?archived=true");
      // Group archived sessions by project, preserving backend order (newest first).
      const byProject = new Map<string, ArchivedChat[]>();
      for (const s of data.sessions) {
        const key = s.key;
        const title = s.title && s.title.length > 0 ? s.title : key;
        const time = dateTime(s.updated_at || s.created_at);
        const project = s.project && s.project.length > 0 ? s.project : NO_PROJECT;
        const list = byProject.get(project) ?? [];
        list.push({ key, title, time });
        byProject.set(project, list);
      }
      setGroups(
        Array.from(byProject.entries()).map(([project, chats]) => ({ project, chats })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const projectLabel = (project: string) => (project === NO_PROJECT ? t("noProject") : project);
  const isNoProject = (project: string) => project === NO_PROJECT;

  const projects = useMemo(() => groups.map((g) => projectLabel(g.project)), [groups]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups
      .filter((g) => projectFilter === "all" || projectLabel(g.project) === projectFilter)
      .map((g) => ({
        ...g,
        chats: g.chats.filter((c) => {
          if (chatFilter === "temp" && !isNoProject(g.project)) return false;
          if (chatFilter === "project" && isNoProject(g.project)) return false;
          if (!needle) return true;
          return `${c.title} ${c.time}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((g) => g.chats.length > 0 || (!needle && projectFilter !== "all"));
  }, [groups, q, chatFilter, projectFilter]);

  const removeChat = (key: string) => {
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, chats: g.chats.filter((c) => c.key !== key) }))
        .filter((g) => g.chats.length > 0),
    );
  };

  const unarchive = async (key: string) => {
    setBusyKey(key);
    try {
      await apiFetch(`/sessions/${encodeURIComponent(key)}/unarchive`, { method: "POST" });
      removeChat(key);
      toast.success(t("unarchiveDone"));
    } catch (e: unknown) {
      toast.error(t("archivedActionFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusyKey(null);
    }
  };

  const deleteChat = async (key: string) => {
    setBusyKey(key);
    try {
      await apiFetch(`/sessions/${encodeURIComponent(key)}`, { method: "DELETE" });
      removeChat(key);
      toast.success(t("deleteDone"));
    } catch (e: unknown) {
      toast.error(t("archivedActionFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusyKey(null);
    }
  };

  const deleteAll = async () => {
    setLoading(true);
    try {
      const keys = groups.flatMap((g) => g.chats.map((c) => c.key));
      await Promise.all(
        keys.map((key) => apiFetch(`/sessions/${encodeURIComponent(key)}`, { method: "DELETE" })),
      );
      setGroups([]);
      toast.success(t("deleteAllDone"));
    } catch (e: unknown) {
      toast.error(t("archivedActionFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-[22px] font-semibold text-codex-text tracking-tight m-0">{t("archived")}</h2>
        <button
          type="button"
          className="text-[12.5px] text-[#f87171] hover:underline disabled:opacity-50"
          onClick={() => void deleteAll()}
          disabled={loading || groups.length === 0}
        >
          {t("deleteAllArchived")}
        </button>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-[#1e1e1e] border border-codex-border rounded-lg px-3 py-2">
          <Search size={14} className="text-[#555] shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchArchived")}
            aria-label={t("searchArchived")}
            className="bg-transparent outline-none text-[13px] text-codex-text-secondary placeholder:text-codex-muted w-full"
          />
        </div>
        <select
          value={chatFilter}
          onChange={(e) => setChatFilter(e.target.value)}
          aria-label={t("chatTypeFilter")}
          className="bg-codex-elevated border-codex-border-strong rounded-md px-3 py-2 text-[12.5px] text-codex-text-secondary"
        >
          <option value="all">{t("allChats")}</option>
          <option value="temp">{t("tempChats")}</option>
          <option value="project">{t("projectChats")}</option>
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          aria-label={t("projectFilter")}
          className="bg-codex-elevated border-codex-border-strong rounded-md px-3 py-2 text-[12.5px] text-codex-text-secondary"
        >
          <option value="all">{t("allProjects")}</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-center text-[13px] text-codex-muted py-10">{t("loading")}</div>
      )}
      {!loading && error && (
        <div className="text-center text-[13px] text-[#e85d5d] py-10">{t("archivedLoadFailed", { error })}</div>
      )}

      {!loading && !error && (
        <>
          {visible.length === 0 ? (
            <div className="ac-empty text-center text-[13px] text-codex-muted py-10">
              {groups.length === 0 ? t("noArchived") : t("noArchivedMatch")}
            </div>
          ) : (
            <div className="ac-groups flex flex-col gap-2.5">
              {visible.map((g) => {
                const isCollapsed = !!collapsed[g.project];
                return (
                  <div
                    key={g.project}
                    className={`ac-group bg-codex-surface border border-codex-border rounded-xl overflow-hidden${isCollapsed ? " is-collapsed" : ""}`}
                  >
                    <button
                      type="button"
                      className="ac-group-head flex items-center gap-2.5 w-full px-3.5 py-3 bg-transparent border-0 text-codex-text text-left hover:bg-[#262626]"
                      onClick={() =>
                        setCollapsed((c) => ({ ...c, [g.project]: !c[g.project] }))
                      }
                    >
                      <svg
                        className="w-[15px] h-[15px] shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#888"
                        strokeWidth="1.6"
                        aria-hidden="true"
                      >
                        <path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
                      </svg>
                      <span className="text-[13.5px] font-medium flex-1">{projectLabel(g.project)}</span>
                      <span className="text-[12px] text-codex-muted">
                        {t("archivedCount", { n: g.chats.length })}
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#666"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {!isCollapsed && (
                      <div className="ac-group-body">
                        {g.chats.map((c) => (
                          <div
                            key={c.key}
                            className="flex items-center gap-3 px-3.5 py-2.5 border-t border-[#2a2a2a]"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] text-codex-text truncate">{c.title}</div>
                              <div className="text-[11.5px] text-codex-muted mt-0.5">{c.time}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                title={t("delete")}
                                aria-label={t("delete")}
                                disabled={busyKey === c.key}
                                onClick={() => void deleteChat(c.key)}
                                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-codex-muted hover:bg-[#333] hover:text-[#f87171] disabled:opacity-40"
                              >
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                disabled={busyKey === c.key}
                                onClick={() => void unarchive(c.key)}
                                className="text-[12.5px] text-[#4c8dff] hover:underline disabled:opacity-40"
                              >
                                {busyKey === c.key ? "…" : t("unarchive")}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
