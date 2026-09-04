import { useMemo, useState } from "react";
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
  { id: "search", action: "打开搜索", keys: ["Ctrl", "K"] },
  { id: "settings", action: "打开设置", keys: ["Ctrl", ","] },
  { id: "new", action: "新建对话", keys: ["Ctrl", "N"] },
  { id: "term", action: "切换终端", keys: ["Ctrl", "`"] },
  { id: "tools", action: "切换工具面板", keys: ["Ctrl", "\\"] },
  { id: "send", action: "发送消息", keys: ["Enter"] },
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
            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#222]"
            role="listitem"
          >
            <span className="text-[13.5px] text-[#d4d4d4]">{s.action}</span>
            <div className="flex gap-1">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="text-[11.5px] text-[#999] bg-[#2a2a2a] border border-[#3a3a3a] rounded px-1.5 py-0.5"
                >
                  {k}
                </kbd>
              ))}
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
            ChatGPT Plus
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
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#0a2a4a] shrink-0 grid place-items-center text-[#36c5f0] text-xs font-bold">
            E
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium text-[#e0e0e0]">Microsoft Edge</div>
            <div className="text-xs text-codex-muted">{t("edgeDisconnected")}</div>
          </div>
          <ActionBtn>{t("install")}</ActionBtn>
        </div>
      </SettingsCard>
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
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(PLUGIN_ITEMS.map((p) => [p.id, p.on])),
  );

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
        <div className="flex gap-2.5 shrink-0">
          <ActionBtn>{t("browseCatalog")}</ActionBtn>
          <button
            type="button"
            className="px-3.5 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[13px] font-medium hover:bg-[#f2f2f2]"
          >
            {t("add")} ▾
          </button>
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
    </div>
  );
}

export function BrowserSettingsPage() {
  const { t } = useTranslation("settings");
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("browser")}</PageTitle>
      <PageSub>{t("browserDesc")}</PageSub>
      <SettingsCard>
        <SettingsRow label={t("embeddedBrowser")} desc={t("embeddedBrowserDesc")}>
          <Toggle checked={enabled} onChange={setEnabled} label={t("embeddedBrowser")} />
        </SettingsRow>
        <SettingsRow label={t("defaultBrowser")} desc={t("defaultBrowserDesc")}>
          <select className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0]">
            <option>Chromium</option>
            <option>System</option>
          </select>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function HooksPage() {
  const { t } = useTranslation("settings");
  const [q, setQ] = useState("");
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("hooks")}</PageTitle>
      <PageSub>{t("hooksDesc")}</PageSub>
      <div className="flex items-center gap-2 mb-3">
        <ActionBtn>{t("scopeUser")} ▾</ActionBtn>
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
        <button
          type="button"
          className="px-3 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[12.5px] font-medium"
        >
          + {t("new")}
        </button>
      </div>
      <EmptyState
        title={t("noHooks")}
        desc={t("noHooksDesc")}
        action={
          <button type="button" className="px-3 py-1.5 rounded-md bg-[#e8e8e8] text-[#1a1a1a] text-[12.5px] font-medium">
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
  const [prefix, setPrefix] = useState("codec/");
  const [merge, setMerge] = useState("merge");
  const [force, setForce] = useState(false);

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
      </SettingsCard>
    </div>
  );
}

export function ArchivedPage() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("archived")}</PageTitle>
      <PageSub>{t("archivedDesc")}</PageSub>
      <EmptyState title={t("noArchived")} desc={t("noArchivedDesc")} />
    </div>
  );
}
