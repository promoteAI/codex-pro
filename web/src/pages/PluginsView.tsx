import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "../hooks/use-api";
import { useWsSubscribe } from "../hooks/use-ws";
import { useShellStore } from "../stores/shell";
import { toast } from "../stores/toast";
import { SkillDetailDrawer } from "../components/SkillDetailDrawer";
import { AddMarketModal } from "../components/AddMarketModal";
import { useIsAdmin } from "../stores/capabilities";

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

interface SkillItem {
  name: string;
  description: string;
  enabled: boolean;
  source?: string;
}

type SkillScope = "personal" | "system" | "recommended";

function PLUGIN_CHIP_FOR(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("sheet") || lower.includes("spread")) return "Sh";
  if (lower.includes("present") || lower.includes("slide")) return "Sl";
  if (lower.includes("doc") || lower.includes("document")) return "Do";
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("figma")) return "Fi";
  if (lower.includes("notion")) return "No";
  if (lower.includes("linear")) return "Li";
  if (lower.includes("slack")) return "Sk";
  if (lower.includes("jira")) return "Ji";
  if (lower.includes("terminal") || lower.includes("term")) return ">_";
  if (lower.includes("browser") || lower.includes("web")) return "Br";
  if (lower.includes("github") || lower.includes("git")) return "GH";
  if (lower.includes("computer") || lower.includes("use")) return "CU";
  if (lower.includes("automate")) return "Au";
  if (lower.includes("canvas")) return "Ca";
  if (lower.includes("hook")) return "Ho";
  if (lower.includes("rule")) return "Rl";
  if (lower.includes("skill")) return "Sk";
  if (lower.includes("agent") || lower.includes("subagent")) return "Ag";
  return name.substring(0, 2).toUpperCase();
}

const PLUGIN_CHIP_COLOR_FOR = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes("computer") || lower.includes("use")) return "#1b5e20";
  if (lower.includes("sheet")) return "#0f9d58";
  if (lower.includes("present")) return "#f4b400";
  if (lower.includes("doc") || lower.includes("document")) return "#4285f4";
  if (lower.includes("pdf")) return "#ea4335";
  if (lower.includes("figma")) return "#7c4dff";
  if (lower.includes("notion")) return "#00c853";
  if (lower.includes("linear")) return "#ff6d00";
  if (lower.includes("slack")) return "#0091ea";
  if (lower.includes("jira")) return "#c2185b";
  if (lower.includes("terminal")) return "#455a64";
  if (lower.includes("browser")) return "#6a1b9a";
  if (lower.includes("github") || lower.includes("git")) return "#24292f";
  if (lower.includes("automate")) return "#5b8def";
  if (lower.includes("canvas")) return "#7c5cff";
  if (lower.includes("hook")) return "#fb7185";
  if (lower.includes("rule")) return "#fbbf24";
  if (lower.includes("skill")) return "#c084fc";
  if (lower.includes("agent") || lower.includes("subagent")) return "#67e8f9";
  if (lower.includes("design")) return "#a78bfa";
  if (lower.includes("file")) return "#818cf8";
  return "#6e6e6e";
};

const SYSTEM_SKILL_NAMES = new Set([
  "frontend-design",
  "review-security",
  "review-bugbot",
  "create-skill",
  "create-subagent",
]);

const SKILL_GRADIENTS = [
  "linear-gradient(145deg,#f472b6,#a855f7)",
  "linear-gradient(145deg,#c084fc,#6366f1)",
  "linear-gradient(145deg,#fbbf24,#f97316)",
  "linear-gradient(145deg,#fb7185,#e11d48)",
  "linear-gradient(145deg,#a78bfa,#7c3aed)",
  "linear-gradient(145deg,#67e8f9,#0ea5e9)",
  "linear-gradient(145deg,#34d399,#059669)",
  "linear-gradient(145deg,#f87171,#b91c1c)",
  "linear-gradient(145deg,#818cf8,#4f46e5)",
  "linear-gradient(145deg,#f0abfc,#db2777)",
];

function skillGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SKILL_GRADIENTS[h % SKILL_GRADIENTS.length];
}

function skillScopeOf(s: SkillItem): SkillScope {
  // Backend /skills now reports `source`: user → 个人, builtin → 系统,
  // external → 推荐. Fall back to the legacy name-list heuristics only when
  // the field is missing (older gateway responses).
  if (s.source === "user") return "personal";
  if (s.source === "builtin") return "system";
  if (s.source === "external") return "recommended";
  const n = s.name.toLowerCase();
  if (SYSTEM_SKILL_NAMES.has(n) || n.startsWith("review-") || n.includes("frontend")) {
    return "system";
  }
  if (!s.enabled) return "recommended";
  return "personal";
}

function SkillGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2 4 6.5v11L12 22l8-4.5v-11L12 2zm0 2.2 5.8 3.3v.9L12 12.1 6.2 8.4v-.9L12 4.2zm-5.8 5.5L12 13.4l5.8-3.7v7.1L12 19.8l-5.8-3.3V9.7z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`pl-toggle${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="pl-toggle-knob" />
    </button>
  );
}

function SkillCard({
  skill,
  onOpen,
  showCheck = true,
}: {
  skill: SkillItem;
  onOpen: (name: string) => void;
  showCheck?: boolean;
}) {
  return (
    <button
      type="button"
      className="pl-sk-card"
      onClick={() => onOpen(skill.name)}
    >
      <span className="pl-sk-ico" style={{ background: skillGradient(skill.name) }} aria-hidden="true">
        <SkillGlyph />
      </span>
      <span className="pl-sk-info">
        <span className="pl-sk-name">{skill.name}</span>
        <span className="pl-sk-desc">{skill.description || "—"}</span>
      </span>
      {showCheck && (
        <span className={`pl-sk-check${skill.enabled ? " is-on" : ""}`} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        </span>
      )}
    </button>
  );
}

/** Codex-styled plugins marketplace (prototype pl-view). */
export function PluginsView() {
  const openSettings = useShellStore((s) => s.openSettings);
  const isAdmin = useIsAdmin();
  const canAdmin = isAdmin !== false;

  const [tab, setTab] = useState<"plugins" | "skills">("plugins");
  const [pluginQuery, setPluginQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillTab, setSkillTab] = useState<SkillScope>("personal");
  const [addOpen, setAddOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [installedExpanded, setInstalledExpanded] = useState(false);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const addWrapRef = useRef<HTMLDivElement>(null);

  const { data: pluginsData, loading: pluginsLoading, error: pluginsError, refetch: refetchPlugins } =
    useApi<{ plugins: ApiPlugin[] }>(tab === "plugins" ? "/plugins" : null);

  const { data: skillsData, loading: skillsLoading, error: skillsError, refetch: refetchSkills } =
    useApi<{ skills: SkillItem[] }>(tab === "skills" ? "/skills" : null);

  useWsSubscribe(["plugins"], () => refetchPlugins(), ["plugin_changed"]);
  useWsSubscribe(["skills"], () => refetchSkills(), ["skill_changed"]);

  useEffect(() => {
    if (!addOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (addWrapRef.current?.contains(e.target as Node)) return;
      setAddOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [addOpen]);

  const apiPlugins = useMemo<ApiPlugin[]>(() => pluginsData?.plugins ?? [], [pluginsData]);

  const enabledPlugins = useMemo(() => {
    const q = pluginQuery.trim().toLowerCase();
    return apiPlugins.filter((p) => {
      if (p.status === "disabled") return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
    });
  }, [apiPlugins, pluginQuery]);

  const disabledPlugins = useMemo(() => {
    const q = pluginQuery.trim().toLowerCase();
    return apiPlugins.filter((p) => {
      if (p.status !== "disabled") return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
    });
  }, [apiPlugins, pluginQuery]);

  const skills = useMemo(() => skillsData?.skills ?? [], [skillsData]);

  const installedSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    return skills.filter((s) => {
      if (!s.enabled) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
    });
  }, [skills, skillQuery]);

  const scopedSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    return skills.filter((s) => {
      if (skillScopeOf(s) !== skillTab) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
    });
  }, [skills, skillTab, skillQuery]);

  const installedPreview = installedExpanded ? installedSkills : installedSkills.slice(0, 6);
  const scopePreview = scopeExpanded ? scopedSkills : scopedSkills.slice(0, 6);
  const installedExtra = Math.max(0, installedSkills.length - 6);
  const scopeExtra = Math.max(0, scopedSkills.length - 6);

  const togglePlugin = async (name: string, enable: boolean) => {
    setToggling(name);
    try {
      const resp = await fetch(`/api/v1/plugins/${encodeURIComponent(name)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: enable }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      await refetchPlugins();
      toast.success(enable ? `插件「${name}」已启用` : `插件「${name}」已禁用`);
    } catch (e: unknown) {
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setToggling(null);
    }
  };

  return (
    <section className="pl-view" aria-label="插件市场">
      <div className="pl-top">
        <div className="pl-tabs" role="tablist" aria-label="插件与技能">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "plugins"}
            className={`pl-tab${tab === "plugins" ? " active" : ""}`}
            onClick={() => setTab("plugins")}
          >
            插件
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "skills"}
            className={`pl-tab${tab === "skills" ? " active" : ""}`}
            onClick={() => setTab("skills")}
          >
            技能
          </button>
        </div>
        <div className="pl-top-actions">
          <button
            type="button"
            className="pl-icon-btn"
            title="刷新"
            aria-label="刷新"
            onClick={() => {
              if (tab === "skills") void refetchSkills();
              else void refetchPlugins();
              toast.success("已刷新");
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.3-5.7" />
              <path d="M20 4v5h-5" />
            </svg>
          </button>
          <button
            type="button"
            className="pl-icon-btn"
            title="插件设置"
            aria-label="插件设置"
            onClick={() => openSettings("plugins")}
          >
            <GearIcon />
          </button>
          <div className="pl-add-wrap" ref={addWrapRef}>
            <button
              type="button"
              className={`pl-add-btn${addOpen ? " is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={addOpen}
              onClick={() => setAddOpen((o) => !o)}
            >
              添加{" "}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div className={`add-plugin-menu${addOpen ? " open" : ""}`} role="menu" hidden={!addOpen}>
              <button
                type="button"
                className="add-plugin-item"
                role="menuitem"
                onClick={() => {
                  setAddOpen(false);
                  toast.info("创建插件（即将推出）");
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <circle cx="12" cy="12" r="2.2" />
                  <path d="M12 3.5v6.3M12 14.2v6.3M3.5 12h6.3M14.2 12h6.3" />
                </svg>
                创建插件
              </button>
              <button
                type="button"
                className="add-plugin-item"
                role="menuitem"
                onClick={() => {
                  setAddOpen(false);
                  setMarketOpen(true);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                添加插件市场
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pl-body">
        {tab === "plugins" && (
        <div className="pl-plugins-panel">
          <div className="pl-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              type="search"
              placeholder="搜索插件"
              aria-label="搜索插件"
              value={pluginQuery}
              onChange={(e) => setPluginQuery(e.target.value)}
            />
          </div>

          {pluginsLoading && (
            <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 24 }}>加载中…</div>
          )}
          {!pluginsLoading && pluginsError && (
            <div style={{ color: "#e85d5d", fontSize: 13, textAlign: "center", padding: 24 }}>
              加载失败：{pluginsError}
            </div>
          )}

          {!pluginsLoading && !pluginsError && (
          <>
            {enabledPlugins.length > 0 && (
            <div className="pl-section">
              <h3 className="pl-section-title">已启用 ({enabledPlugins.length})</h3>
              <div className="pl-grid">
                {enabledPlugins.map((p) => (
                  <div key={p.name} className="pl-card">
                    <span className="pl-card-ico" style={{ background: PLUGIN_CHIP_COLOR_FOR(p.name) }}>
                      {PLUGIN_CHIP_FOR(p.name)}
                    </span>
                    <div className="pl-card-info">
                      <p className="pl-card-name">{p.name}</p>
                      <p className="pl-card-desc">{p.description || "—"}</p>
                    </div>
                    <ToggleSwitch
                      checked={true}
                      onChange={() => togglePlugin(p.name, false)}
                      label={`禁用 ${p.name}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            )}

            {disabledPlugins.length > 0 && (
            <div className="pl-section">
              <h3 className="pl-section-title">已禁用 ({disabledPlugins.length})</h3>
              <div className="pl-grid">
                {disabledPlugins.map((p) => (
                  <div key={p.name} className="pl-card pl-card--dimmed">
                    <span className="pl-card-ico" style={{ background: PLUGIN_CHIP_COLOR_FOR(p.name) }}>
                      {PLUGIN_CHIP_FOR(p.name)}
                    </span>
                    <div className="pl-card-info">
                      <p className="pl-card-name">{p.name}</p>
                      <p className="pl-card-desc">{p.description || "—"}</p>
                    </div>
                    <button
                      type="button"
                      className="pl-card-btn"
                      disabled={toggling === p.name}
                      onClick={() => togglePlugin(p.name, true)}
                    >
                      {toggling === p.name ? "…" : "启用"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            )}

            {enabledPlugins.length === 0 && disabledPlugins.length === 0 && (
              <div className="pl-section" style={{ textAlign: "center", color: "#6e6e6e", fontSize: 13, padding: 32 }}>
                未发现插件
              </div>
            )}
          </>
          )}
        </div>
        )}

        {tab === "skills" && (
        <div className="pl-skills-panel is-visible">
          <span className="pl-sk-badge">技能</span>
          <h1 className="pl-sk-title">技能</h1>
          <p className="pl-sk-sub">通过任务专用技能扩展 Codex</p>

          <div className="pl-sk-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              type="search"
              placeholder="搜索技能"
              aria-label="搜索技能"
              value={skillQuery}
              onChange={(e) => setSkillQuery(e.target.value)}
            />
          </div>

          {skillsLoading && (
            <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 24 }}>加载中…</div>
          )}
          {!skillsLoading && skillsError && (
            <div style={{ color: "#e85d5d", fontSize: 13, textAlign: "center", padding: 24 }}>
              加载失败：{skillsError}
            </div>
          )}

          {!skillsLoading && !skillsError && (
            <>
              <div className="pl-sk-block">
                <h2 className="pl-sk-block-title">已安装</h2>
                {installedPreview.length === 0 ? (
                  <div style={{ color: "#6e6e6e", fontSize: 13, padding: "8px 0 16px" }}>暂无已安装技能</div>
                ) : (
                  <div className="pl-sk-grid">
                    {installedPreview.map((s) => (
                      <SkillCard key={`inst-${s.name}`} skill={s} onOpen={setSelectedSkill} />
                    ))}
                  </div>
                )}
                {installedExtra > 0 && !installedExpanded && (
                  <button
                    type="button"
                    className="pl-sk-more"
                    onClick={() => setInstalledExpanded(true)}
                  >
                    查看另有 {installedExtra} 项
                  </button>
                )}
              </div>

              <div className="pl-sk-scopes" role="tablist" aria-label="技能分类">
                {(
                  [
                    ["personal", "个人"],
                    ["system", "系统"],
                    ["recommended", "推荐"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`pl-sk-scope${skillTab === id ? " active" : ""}`}
                    onClick={() => {
                      setSkillTab(id);
                      setScopeExpanded(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="pl-sk-scope-panel is-active">
                {scopePreview.length === 0 ? (
                  <div style={{ color: "#6e6e6e", fontSize: 13, padding: "8px 0" }}>该分类暂无技能</div>
                ) : (
                  <div className="pl-sk-grid">
                    {scopePreview.map((s) => (
                      <SkillCard
                        key={`scope-${s.name}`}
                        skill={s}
                        onOpen={setSelectedSkill}
                        showCheck={skillTab !== "recommended"}
                      />
                    ))}
                  </div>
                )}
                {scopeExtra > 0 && !scopeExpanded && (
                  <button
                    type="button"
                    className="pl-sk-more"
                    onClick={() => setScopeExpanded(true)}
                  >
                    查看另有 {scopeExtra} 项
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {selectedSkill && (
        <SkillDetailDrawer
          name={selectedSkill}
          canAdmin={canAdmin}
          onClose={() => setSelectedSkill(null)}
        />
      )}

      <AddMarketModal open={marketOpen} onClose={() => setMarketOpen(false)} />
    </section>
  );
}
