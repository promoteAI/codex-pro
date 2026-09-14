import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { toast } from "../../../stores/toast";

export function VoicePage() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("voice")}</PageTitle>
      <PageSub>{t("voiceDesc")}</PageSub>
      <SectionTitle>{t("secApp")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("microphone")} desc={t("microphoneDesc")}>
          <select className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0]">
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
          <span className="text-[12.5px] text-[#888]">{t("off")}</span>
        </SettingsRow>
        <SettingsRow label={t("toggleDictation")} desc={t("toggleDictationDesc")}>
          <span className="text-[12.5px] text-[#888]">{t("off")}</span>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard>
        <SettingsRow label={t("dictationDict")} desc={t("dictationDictDesc")}>
          <ActionBtn>+ {t("addEntry")}</ActionBtn>
        </SettingsRow>
        <div className="flex items-center justify-between px-4 py-3 border-t border-codex-border">
          <div className="text-[13px] text-[#c8c8c8] bg-[#1a1a1a] border border-[#333] rounded-md px-3 py-1.5 flex-1 mr-3">
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
  const [text, setText] = useState("代码注释始终用英文，回答始终用中文");
  const [localMem, setLocalMem] = useState(false);
  const [toolMem, setToolMem] = useState(true);

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("personalization")}</PageTitle>

      <div className="bg-[#222] border border-[#2e2e2e] rounded-xl p-4 mb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[14px] font-medium text-[#e8e8e8] mb-1">{t("codexInstructions")}</div>
            <div className="text-xs text-codex-muted">{t("codexInstructionsDesc")}</div>
          </div>
          <ActionBtn>{t("save")}</ActionBtn>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-[13px] text-[#e0e0e0] outline-none focus:border-[#555] resize-y min-h-[100px]"
          placeholder={t("instructionsPlaceholder")}
        />
      </div>

      <div className="bg-[#222] border border-[#2e2e2e] rounded-xl p-4 mb-5">
        <div className="text-[14px] font-medium text-[#e8e8e8] mb-1">{t("memory")}</div>
        <div className="text-xs text-codex-muted mb-3">{t("memorySettingsDesc")}</div>
        <SettingsCard className="mb-0 border-0 bg-[#1e1e1e]">
          <SettingsRow label={t("localMemory")} desc={t("localMemoryDesc")}>
            <Toggle checked={localMem} onChange={setLocalMem} label={t("localMemory")} />
          </SettingsRow>
          <SettingsRow label={t("toolMemory")} desc={t("toolMemoryDesc")}>
            <Toggle checked={toolMem} onChange={setToolMem} label={t("toolMemory")} />
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
    <div className="max-w-[720px]">
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
              selected === pet.id ? "bg-[#222] border-[#3a3a3a]" : "bg-[#1e1e1e] border-[#262626]"
            }`}
          >
            <div
              className="w-10 h-10 rounded-lg shrink-0"
              style={{ background: `linear-gradient(135deg, ${pet.color}, #1a1a1a)` }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium text-[#e0e0e0]">{pet.name}</div>
              <div className="text-xs text-codex-muted">{pet.desc}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(pet.id)}
              className={`px-3 py-1 rounded-md text-[12.5px] border ${
                selected === pet.id
                  ? "bg-[#2a3a2a] border-[#3a5a3a] text-codex-success"
                  : "bg-[#2a2a2a] border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#323232]"
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
    <div className="max-w-[720px]">
      <PageTitle>{t("shortcuts")}</PageTitle>
      <div className="flex items-center gap-2 bg-[#1e1e1e] border border-codex-border rounded-lg px-3 py-2 mb-4">
        <Search size={14} className="text-[#555] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchShortcuts")}
          className="bg-transparent outline-none text-[13px] text-[#c0c0c0] placeholder:text-[#6a6a6a] w-full"
        />
      </div>
      <div className="space-y-1">
        {list.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-[#222]"
            role="listitem"
          >
            <span className="text-[13.5px] text-[#d4d4d4]">{s.action}</span>
            <div className="flex gap-1 shrink-0">
              {s.keys.length === 0 ? (
                <span className="text-[11.5px] text-[#666]">{t("shortcutUnset")}</span>
              ) : (
                s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="text-[11.5px] text-[#999] bg-[#2a2a2a] border border-[#3a3a3a] rounded px-1.5 py-0.5"
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
    <div className="max-w-[720px]">
      <PageTitle>{t("account")}</PageTitle>
      <div className="flex items-center gap-4 bg-[#222] border border-[#2e2e2e] rounded-xl px-4 py-4 mb-5">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4a6cf7] to-[#7c5cff] grid place-items-center text-lg font-semibold text-white shrink-0">
          C
        </div>
        <div>
          <div className="text-[15px] font-semibold text-[#f0f0f0]">custom</div>
          <div className="text-[12.5px] text-[#7a7a7a]">custom@example.com</div>
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
  const [anyScreen, setAnyScreen] = useState(true);
  const [chrome, setChrome] = useState(true);
  const [excel, setExcel] = useState(true);

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("computer")}</PageTitle>
      <PageSub>{t("computerDesc")}</PageSub>
      <SectionTitle>{t("control")}</SectionTitle>
      <SettingsCard>
        <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-codex-border">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#5b8def] to-[#7c5cff] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-[#e0e0e0]">{t("anyScreen")}</div>
            <div className="text-xs text-codex-muted">{t("anyScreenDesc")}</div>
          </div>
          <Toggle checked={anyScreen} onChange={setAnyScreen} label={t("anyScreen")} />
        </div>
        <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-codex-border">
          <div className="w-9 h-9 rounded-lg bg-white shrink-0 grid place-items-center text-[#4285F4] text-xs font-bold">
            G
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-[#e0e0e0]">Google Chrome</div>
            <div className="text-xs text-codex-muted">{t("chromeConnected")}</div>
          </div>
          <ActionBtn>{t("manage")}</ActionBtn>
          <Toggle checked={chrome} onChange={setChrome} label="Chrome" />
        </div>
        <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-codex-border">
          <div className="w-9 h-9 rounded-lg bg-[#0a2a4a] shrink-0 grid place-items-center text-[#36c5f0] text-xs font-bold">
            E
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-[#e0e0e0]">Microsoft Edge</div>
            <div className="text-xs text-codex-muted">{t("edgeDisconnected")}</div>
          </div>
          <ActionBtn>{t("install")}</ActionBtn>
        </div>
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#107c41] shrink-0 grid place-items-center text-white text-xs font-bold">
            X
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-[#e0e0e0]">Microsoft Excel</div>
            <div className="text-xs text-codex-muted">{t("excelDesc")}</div>
          </div>
          <Toggle checked={excel} onChange={setExcel} label="Excel" />
        </div>
      </SettingsCard>
      <SectionTitle>{t("alwaysAllowApps")}</SectionTitle>
      <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl px-4 py-6 text-center text-[13px] text-[#6e6e6e]">
        {t("alwaysAllowEmpty")}
      </div>
    </div>
  );
}

const PLUGIN_ITEMS = [
  { id: "automate", name: "Automate", desc: "Use this skill to create Codex Automations.", tag: "个人", on: true },
  {
    id: "autopilot",
    name: "Autopilot",
    desc: "Keep a PR merge-ready by triaging comments and fixing CI.",
    tag: "个人",
    on: true,
  },
  {
    id: "canvas",
    name: "Canvas",
    desc: "A live React app that the user can open beside the chat.",
    tag: "个人",
    on: true,
  },
  { id: "filesystem", name: "filesystem", desc: "Read and write local files through MCP.", tag: "MCP", on: true },
  { id: "github", name: "github", desc: "Issues, PRs and repository metadata via MCP.", tag: "MCP", on: false },
];

export function SettingsPluginsPage() {
  const { t } = useTranslation("settings");
  const [tab, setTab] = useState<"plugins" | "mcp" | "skills">("plugins");
  const [q, setQ] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(PLUGIN_ITEMS.map((p) => [p.id, p.on])),
  );

  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addMenuOpen]);

  const filtered = PLUGIN_ITEMS.filter((p) => {
    if (tab === "mcp" && p.tag !== "MCP") return false;
    if (tab === "plugins" && p.tag === "MCP") return false;
    if (tab === "skills") return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.desc.toLowerCase().includes(q.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-[800px]">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <PageTitle>{t("plugins")}</PageTitle>
          <PageSub>{t("pluginsDesc")}</PageSub>
        </div>
        <div className="flex gap-2.5 shrink-0 items-start">
          <ActionBtn>{t("browseCatalog")}</ActionBtn>
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
                className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[200px] p-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-[0_12px_32px_rgba(0,0,0,.45)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false);
                    toast.info(t("createPlugin") + "（即将推出）");
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-[#e0e0e0] hover:bg-[#353535]"
                >
                  <span className="w-4 h-4 inline-flex items-center justify-center text-[#888]">
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
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-[#e0e0e0] hover:bg-[#353535]"
                >
                  <span className="w-4 h-4 inline-flex items-center justify-center text-[#888]">
                    <Plus size={14} />
                  </span>
                  {t("addMarketplace")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenuOpen(false);
                    toast.info(t("addMcp") + "（即将推出）");
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-[#e0e0e0] hover:bg-[#353535]"
                >
                  <span className="w-4 h-4 inline-flex items-center justify-center text-[#888]">
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
            ["plugins", `${t("plugins")} 7`],
            ["mcp", "MCP 4"],
            ["skills", `${t("skillsTab")} 137`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`text-[13px] pb-1 border-b-[1.5px] -mb-px ${
              tab === id
                ? "text-[#e0e0e0] border-[#e0e0e0]"
                : "text-codex-muted border-transparent hover:text-[#a0a0a0]"
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
            className="bg-transparent outline-none text-[12.5px] text-[#c0c0c0] w-full placeholder:text-[#6a6a6a]"
          />
        </div>
      </div>

      <div className="pt-4 space-y-2">
        {tab === "skills" && (
          <EmptyState title={t("noSkills")} desc={t("noSkillsDesc")} />
        )}
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3.5 px-4 py-3.5 bg-[#1e1e1e] border border-[#262626] rounded-[10px] hover:border-[#333]"
          >
            <div className="w-9 h-9 rounded-lg bg-[#252525] grid place-items-center text-[#888] shrink-0 text-xs">
              ◆
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium text-[#d4d4d4] mb-0.5">{p.name}</div>
              <div className="text-xs text-codex-muted line-clamp-2">{p.desc}</div>
            </div>
            <span className="text-xs text-[#666] px-2 py-0.5 bg-[#252525] rounded shrink-0">{p.tag}</span>
            <Toggle
              checked={!!enabled[p.id]}
              onChange={(v) => setEnabled((s) => ({ ...s, [p.id]: v }))}
              label={p.name}
            />
          </div>
        ))}
      </div>

      <AddMarketModal open={marketOpen} onClose={() => setMarketOpen(false)} />
    </div>
  );
}

export function BrowserSettingsPage() {
  const { t } = useTranslation("settings");
  const [enabled, setEnabled] = useState(true);
  const [ignoreCert, setIgnoreCert] = useState(true);
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("browser")}</PageTitle>
      <SettingsCard>
        <SettingsRow label={t("embeddedBrowser")} desc={t("embeddedBrowserDesc")}>
          <Toggle checked={enabled} onChange={setEnabled} label={t("embeddedBrowser")} />
        </SettingsRow>
      </SettingsCard>
      <SectionTitle>{t("browserSecurity")}</SectionTitle>
      <SettingsCard>
        <SettingsRow label={t("ignoreCert")} desc={t("ignoreCertDesc")}>
          <Toggle checked={ignoreCert} onChange={setIgnoreCert} label={t("ignoreCert")} />
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

export function HooksPage() {
  const { t } = useTranslation(["settings", "common"]);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState("用户");
  const [event, setEvent] = useState("PreToolUse");
  const [runMode, setRunMode] = useState("process");
  const [command, setCommand] = useState("");

  if (creating) {
    return (
      <div className="max-w-[720px]">
        <PageTitle>{t("newHook")}</PageTitle>
        <PageSub>{t("newHookDesc")}</PageSub>
        <SettingsCard>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3.5 border-b border-codex-border">
            <label className="block text-[12px] text-[#8a8a8a]">
              {t("hookEvent")}
              <select
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                className="mt-1.5 w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0]"
              >
                {["PreToolUse", "PostToolUse", "UserPromptSubmit", "PermissionRequest", "Stop", "SessionStart", "SessionEnd"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="block text-[12px] text-[#8a8a8a]">
              {t("hookRunMode")}
              <select
                value={runMode}
                onChange={(e) => setRunMode(e.target.value)}
                className="mt-1.5 w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0]"
              >
                <option value="process">{t("hookRunProcess")}</option>
                <option value="prompt">{t("hookRunPrompt")}</option>
              </select>
            </label>
            <label className="block text-[12px] text-[#8a8a8a]">
              {t("hookScope")}
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="mt-1.5 w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0]"
              >
                <option value="用户">{t("scopeUser")}</option>
                <option value="codex-pro">codex-pro</option>
                <option value="default">default</option>
              </select>
            </label>
          </div>
          <div className="px-4 py-3.5">
            <label className="block text-[12px] text-[#8a8a8a] mb-1.5">{t("hookCommand")}</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={4}
              placeholder={t("hookCommandPlaceholder")}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-[#e0e0e0] outline-none resize-y font-mono"
            />
          </div>
        </SettingsCard>
        <div className="flex justify-end gap-2 mt-4">
          <ActionBtn onClick={() => setCreating(false)}>{t("common:cancel")}</ActionBtn>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="px-3 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[12.5px] font-medium"
          >
            {t("save")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[720px]">
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
          className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0]"
          aria-label={t("hookScope")}
        >
          <option value="用户">{t("scopeUser")}</option>
          <option value="codex-pro">codex-pro</option>
          <option value="default">default</option>
        </select>
        <span className="text-[12.5px] text-codex-muted">{t("hooksCount", { n: 0 })}</span>
        <div className="ml-auto flex items-center gap-1.5 bg-[#1e1e1e] border border-codex-border rounded-lg px-2.5 py-1 w-[200px]">
          <Search size={14} className="text-[#555]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchHooks")}
            className="bg-transparent outline-none text-[12.5px] text-[#c0c0c0] w-full"
          />
        </div>
      </div>
      <div className="flex items-center justify-between mb-6">
        <span className="text-[12.5px] text-codex-muted">{t("installedN", { n: 0 })}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={t("refresh")}
            aria-label={t("refresh")}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-[#c0c0c0] hover:bg-[#333]"
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
    </div>
  );
}

export function ConnectionsPage() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("connections")}</PageTitle>
      <PageSub>{t("connectionsDesc")}</PageSub>
      <EmptyState
        title={t("sshEmpty")}
        desc={t("sshEmptyDesc")}
        action={<ActionBtn>{t("add")}</ActionBtn>}
      />
    </div>
  );
}

export function GitPage() {
  const { t } = useTranslation("settings");
  const [prefix, setPrefix] = useState("codex_pro");
  const [merge, setMerge] = useState("merge");
  const [force, setForce] = useState(false);
  const [draftPr, setDraftPr] = useState(true);
  const [review, setReview] = useState("separate");
  const [autoMerge, setAutoMerge] = useState(false);
  const [monitorInstr, setMonitorInstr] = useState("");
  const [commitInstr, setCommitInstr] = useState("");
  const [prInstr, setPrInstr] = useState("");

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("git")}</PageTitle>
      <SettingsCard>
        <SettingsRow label={t("branchPrefix")} desc={t("branchPrefixDesc")}>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="bg-[#1a1a1a] border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#e0e0e0] w-36 outline-none"
          />
        </SettingsRow>
        <SettingsRow label={t("prMergeMethod")} desc={t("prMergeMethodDesc")}>
          <SegGroup
            value={merge}
            onChange={setMerge}
            options={[
              { id: "merge", label: t("merge") },
              { id: "squash", label: t("squash") },
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t("forcePush")} desc={t("forcePushDesc")}>
          <Toggle checked={force} onChange={setForce} label={t("forcePush")} />
        </SettingsRow>
        <SettingsRow label={t("draftPr")} desc={t("draftPrDesc")}>
          <Toggle checked={draftPr} onChange={setDraftPr} label={t("draftPr")} />
        </SettingsRow>
        <SettingsRow label={t("reviewPresentation")} desc={t("reviewPresentationDesc")}>
          <SegGroup
            value={review}
            onChange={setReview}
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
              <div className="text-[13.5px] font-medium text-[#e4e4e4]">{t("autoMergeWhenReady")}</div>
              <div className="text-[12px] text-[#6e6e6e] mt-1">{t("autoMergeWhenReadyDesc")}</div>
            </div>
            <Toggle checked={autoMerge} onChange={setAutoMerge} label={t("autoMergeWhenReady")} />
          </div>
          <textarea
            value={monitorInstr}
            onChange={(e) => setMonitorInstr(e.target.value)}
            rows={3}
            placeholder={t("monitorInstrPlaceholder")}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-[#e0e0e0] outline-none resize-y"
            aria-label={t("monitorInstrPlaceholder")}
          />
        </div>
      </SettingsCard>

      <SectionTitle>{t("commitInstr")}</SectionTitle>
      <SettingsCard>
        <div className="px-4 py-3.5 space-y-2">
          <div className="text-[12px] text-[#6e6e6e]">{t("commitInstrDesc")}</div>
          <textarea
            value={commitInstr}
            onChange={(e) => setCommitInstr(e.target.value)}
            rows={3}
            placeholder={t("commitInstrPlaceholder")}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-[#e0e0e0] outline-none resize-y"
          />
        </div>
      </SettingsCard>

      <SectionTitle>{t("prInstr")}</SectionTitle>
      <SettingsCard>
        <div className="px-4 py-3.5 space-y-2">
          <div className="text-[12px] text-[#6e6e6e]">{t("prInstrDesc")}</div>
          <textarea
            value={prInstr}
            onChange={(e) => setPrInstr(e.target.value)}
            rows={3}
            placeholder={t("prInstrPlaceholder")}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-md px-3 py-2 text-[12.5px] text-[#e0e0e0] outline-none resize-y"
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
    <div className="max-w-[720px]">
      <PageTitle>{t("environment")}</PageTitle>
      <PageSub>{t("environmentDesc")}</PageSub>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12.5px] text-[#b8b8b8]">{t("chooseProject")}</span>
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
                ? "bg-[#222] border-[#3a3a3a]"
                : "bg-[#1e1e1e] border-[#262626] hover:border-[#333]"
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
              <div className="text-[13.5px] text-[#e0e0e0]">{p.name}</div>
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
  const [root, setRoot] = useState("C:/Users/cheris/.codex/worktrees");
  const [pullUpstream, setPullUpstream] = useState(false);
  const [autoDelete, setAutoDelete] = useState(true);
  const [deleteLimit, setDeleteLimit] = useState(15);

  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("worktrees")}</PageTitle>
      <SettingsCard>
        <SettingsRow label={t("worktreeRoot")} desc={t("worktreeRootDesc")}>
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            className="bg-[#1a1a1a] border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#e0e0e0] w-[280px] max-w-[40vw] outline-none"
          />
        </SettingsRow>
        <SettingsRow label={t("pullUpstream")} desc={t("pullUpstreamDesc")}>
          <Toggle checked={pullUpstream} onChange={setPullUpstream} label={t("pullUpstream")} />
        </SettingsRow>
        <SettingsRow label={t("autoDeleteWorktrees")} desc={t("autoDeleteWorktreesDesc")}>
          <Toggle checked={autoDelete} onChange={setAutoDelete} label={t("autoDeleteWorktrees")} />
        </SettingsRow>
        <SettingsRow label={t("autoDeleteLimit")} desc={t("autoDeleteLimitDesc")}>
          <input
            type="number"
            min={1}
            max={999}
            value={deleteLimit}
            onChange={(e) => setDeleteLimit(Number(e.target.value) || 1)}
            className="bg-[#1a1a1a] border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#e0e0e0] w-20 outline-none"
            aria-label={t("autoDeleteLimit")}
          />
        </SettingsRow>
      </SettingsCard>
      <div className="flex items-center justify-between mt-5 mb-2">
        <span className="text-[12.5px] text-[#b8b8b8]">{t("noWorktreesYet")}</span>
        <button
          type="button"
          title={t("refresh")}
          aria-label={t("refresh")}
          className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-[#c0c0c0] hover:bg-[#333]"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M21 12a9 9 0 1 1-2.6-6.3" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
      <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl px-4 py-8 text-center text-[13px] text-[#6e6e6e]">
        {t("worktreesEmpty")}
      </div>
    </div>
  );
}

type ArchivedChat = { title: string; time: string };
type ArchivedGroup = { project: string; chats: ArchivedChat[] };

const ARCHIVED_SEED: ArchivedGroup[] = [
  {
    project: "无项目",
    chats: [
      { title: "macOS 打包脚本与签名流程", time: "2024年9月4日 10:54" },
      { title: "如何打包为桌面应用", time: "2024年9月4日 09:12" },
      { title: "Electron 启动白屏排查", time: "2024年9月3日 21:40" },
      { title: "更新日志模板", time: "2024年9月3日 18:05" },
      { title: "ci 失败：pnpm lockfile", time: "2024年9月2日 16:22" },
      { title: "本地代理配置", time: "2024年9月2日 11:08" },
      { title: "快捷键冲突整理", time: "2024年9月1日 20:33" },
      { title: "hi", time: "2024年9月1日 09:01" },
    ],
  },
  {
    project: "DeepTutor",
    chats: [
      { title: "课程大纲生成器", time: "2024年9月4日 14:20" },
      { title: "测验题型设计", time: "2024年9月3日 19:45" },
      { title: "向量检索效果对比", time: "2024年9月2日 15:10" },
      { title: "学生进度看板原型", time: "2024年9月1日 22:18" },
      { title: "导入 PDF 讲义", time: "2024年8月30日 17:50" },
    ],
  },
  {
    project: "cheris",
    chats: [
      { title: "个人站点改版", time: "2024年9月3日 12:05" },
      { title: "博客配色调整", time: "2024年8月28日 21:16" },
    ],
  },
];

export function ArchivedPage() {
  const { t } = useTranslation("settings");
  const [groups, setGroups] = useState(ARCHIVED_SEED);
  const [q, setQ] = useState("");
  const [chatFilter, setChatFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const projects = useMemo(() => groups.map((g) => g.project), [groups]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups
      .filter((g) => projectFilter === "all" || g.project === projectFilter)
      .map((g) => ({
        ...g,
        chats: g.chats.filter((c) => {
          if (chatFilter === "temp" && g.project !== "无项目") return false;
          if (chatFilter === "project" && g.project === "无项目") return false;
          if (!needle) return true;
          return `${c.title} ${c.time}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((g) => g.chats.length > 0 || (!needle && projectFilter !== "all"));
  }, [groups, q, chatFilter, projectFilter]);

  const removeChat = (project: string, title: string) => {
    setGroups((prev) =>
      prev
        .map((g) =>
          g.project === project ? { ...g, chats: g.chats.filter((c) => c.title !== title) } : g,
        )
        .filter((g) => g.chats.length > 0),
    );
  };

  return (
    <div className="max-w-[760px]">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-[22px] font-semibold text-[#f0f0f0] tracking-tight m-0">{t("archived")}</h2>
        <button
          type="button"
          className="text-[12.5px] text-[#f87171] hover:underline"
          onClick={() => setGroups([])}
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
            className="bg-transparent outline-none text-[13px] text-[#c0c0c0] placeholder:text-[#6a6a6a] w-full"
          />
        </div>
        <select
          value={chatFilter}
          onChange={(e) => setChatFilter(e.target.value)}
          aria-label={t("chatTypeFilter")}
          className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-2 text-[12.5px] text-[#c0c0c0]"
        >
          <option value="all">{t("allChats")}</option>
          <option value="temp">{t("tempChats")}</option>
          <option value="project">{t("projectChats")}</option>
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          aria-label={t("projectFilter")}
          className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-2 text-[12.5px] text-[#c0c0c0]"
        >
          <option value="all">{t("allProjects")}</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="ac-empty text-center text-[13px] text-[#6e6e6e] py-10">
          {groups.length === 0 ? t("noArchived") : t("noArchivedMatch")}
        </div>
      ) : (
        <div className="ac-groups flex flex-col gap-2.5">
          {visible.map((g) => {
            const isCollapsed = !!collapsed[g.project];
            return (
              <div
                key={g.project}
                className={`ac-group bg-[#222] border border-[#2e2e2e] rounded-xl overflow-hidden${isCollapsed ? " is-collapsed" : ""}`}
              >
                <button
                  type="button"
                  className="ac-group-head flex items-center gap-2.5 w-full px-3.5 py-3 bg-transparent border-0 text-[#e0e0e0] text-left hover:bg-[#262626]"
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
                  <span className="text-[13.5px] font-medium flex-1">{g.project}</span>
                  <span className="text-[12px] text-[#6e6e6e]">
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
                        key={`${g.project}-${c.title}`}
                        className="flex items-center gap-3 px-3.5 py-2.5 border-t border-[#2a2a2a]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-[#e8e8e8] truncate">{c.title}</div>
                          <div className="text-[11.5px] text-[#6e6e6e] mt-0.5">{c.time}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            title={t("delete")}
                            aria-label={t("delete")}
                            onClick={() => removeChat(g.project, c.title)}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#888] hover:bg-[#333] hover:text-[#f87171]"
                          >
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeChat(g.project, c.title)}
                            className="text-[12.5px] text-[#4c8dff] hover:underline"
                          >
                            {t("unarchive")}
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
    </div>
  );
}
