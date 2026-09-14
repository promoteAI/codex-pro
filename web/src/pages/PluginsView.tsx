import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "../hooks/use-api";
import { useWsSubscribe } from "../hooks/use-ws";
import { useShellStore } from "../stores/shell";
import { toast } from "../stores/toast";
import { SkillDetailDrawer } from "../components/SkillDetailDrawer";
import { AddMarketModal } from "../components/AddMarketModal";
import { useIsAdmin } from "../stores/capabilities";

interface PluginItem {
  id: string;
  name: string;
  desc: string;
  scope: "public" | "personal";
  category: "featured" | "productivity";
  chip: string;
  color: string;
  installed?: boolean;
}

interface SkillItem {
  name: string;
  description: string;
  enabled: boolean;
}

type SkillScope = "personal" | "system" | "recommended";

const INSTALLED_CHIPS: { title: string; label: string; color: string }[] = [
  { title: "GitHub", label: "GH", color: "#24292f" },
  { title: "Sheets", label: "Sh", color: "#0f9d58" },
  { title: "Docs", label: "Do", color: "#4285f4" },
  { title: "Slides", label: "Sl", color: "#f4b400" },
  { title: "PDF", label: "PDF", color: "#ea4335" },
  { title: "Figma", label: "Fi", color: "#7c4dff" },
  { title: "Notion", label: "No", color: "#00c853" },
  { title: "Linear", label: "Li", color: "#ff6d00" },
  { title: "Slack", label: "Sk", color: "#0091ea" },
  { title: "Jira", label: "Ji", color: "#c2185b" },
  { title: "Terminal", label: ">_", color: "#455a64" },
  { title: "Browser", label: "Br", color: "#6a1b9a" },
];

/** Marketplace catalog matching the Codex Pro prototype. */
const MARKETPLACE: PluginItem[] = [
  {
    id: "computer-use",
    name: "Computer Use",
    desc: "Control Windows apps",
    scope: "public",
    category: "featured",
    chip: "",
    color: "#1b5e20",
    installed: true,
  },
  {
    id: "spreadsheets",
    name: "Spreadsheets",
    desc: "Create and edit spreadsheets",
    scope: "public",
    category: "featured",
    chip: "Sh",
    color: "#0f9d58",
    installed: true,
  },
  {
    id: "presentations",
    name: "Presentations",
    desc: "Create and edit presentations",
    scope: "public",
    category: "featured",
    chip: "Sl",
    color: "#f4b400",
    installed: true,
  },
  {
    id: "documents",
    name: "Documents",
    desc: "Create and edit documents",
    scope: "public",
    category: "productivity",
    chip: "Do",
    color: "#4285f4",
    installed: true,
  },
  {
    id: "pdf",
    name: "PDF",
    desc: "Read and annotate PDFs",
    scope: "public",
    category: "productivity",
    chip: "PDF",
    color: "#ea4335",
    installed: true,
  },
  {
    id: "spreadsheets-pro",
    name: "Spreadsheets",
    desc: "Create and edit spreadsheets",
    scope: "personal",
    category: "productivity",
    chip: "Sh",
    color: "#0f9d58",
  },
  {
    id: "presentations-pro",
    name: "Presentations",
    desc: "Create and edit presentations",
    scope: "personal",
    category: "productivity",
    chip: "Sl",
    color: "#f4b400",
  },
];

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

function ComputerUseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function MoreDots() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
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
  const [pluginScope, setPluginScope] = useState<"public" | "personal">("public");
  const [pluginQuery, setPluginQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillTab, setSkillTab] = useState<SkillScope>("personal");
  const [addOpen, setAddOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [installedExpanded, setInstalledExpanded] = useState(false);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const addWrapRef = useRef<HTMLDivElement>(null);

  const { data: skillsData, loading: skillsLoading, error: skillsError, refetch } =
    useApi<{ skills: SkillItem[] }>(tab === "skills" ? "/skills" : null);

  useWsSubscribe(["skills"], () => refetch(), ["skill_changed"]);

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

  const plugins = useMemo(() => {
    const q = pluginQuery.trim().toLowerCase();
    return MARKETPLACE.filter((p) => {
      if (p.scope !== pluginScope) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    });
  }, [pluginQuery, pluginScope]);

  const featured = plugins.filter((p) => p.category === "featured");
  const productivity = plugins.filter((p) => p.category === "productivity");

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

  const onPluginClick = (p: PluginItem) => {
    toast.info(`插件「${p.name}」· ${p.desc}`);
  };

  const onChipClick = (title: string) => {
    toast.info(`已安装：${title}`);
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
              if (tab === "skills") void refetch();
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

          <div className="pl-installed">
            <div className="pl-installed-head">
              <h3>已安装</h3>
              <button
                type="button"
                className="pl-icon-btn"
                title="管理已安装"
                aria-label="管理已安装"
                onClick={() => openSettings("plugins")}
              >
                <GearIcon />
              </button>
            </div>
            <div className="pl-installed-row" aria-label="已安装插件">
              {INSTALLED_CHIPS.map((c) => (
                <button
                  key={c.title}
                  type="button"
                  className="pl-chip"
                  style={{ background: c.color }}
                  title={c.title}
                  onClick={() => onChipClick(c.title)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pl-filters" role="tablist" aria-label="插件来源">
            <button
              type="button"
              className={`pl-filter${pluginScope === "public" ? " active" : ""}`}
              onClick={() => setPluginScope("public")}
            >
              公开
            </button>
            <button
              type="button"
              className={`pl-filter${pluginScope === "personal" ? " active" : ""}`}
              onClick={() => setPluginScope("personal")}
            >
              个人
            </button>
            <button type="button" className="pl-icon-btn" title="排序" aria-label="排序">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z" />
              </svg>
            </button>
          </div>

          {featured.length > 0 && (
            <div className="pl-section">
              <h3 className="pl-section-title">Featured</h3>
              <div className="pl-grid">
                {featured.map((p) => (
                  <div
                    key={p.id}
                    className="pl-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => onPluginClick(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPluginClick(p);
                      }
                    }}
                  >
                    <span className="pl-card-ico" style={{ background: p.color }}>
                      {p.id === "computer-use" ? <ComputerUseIcon /> : p.chip}
                    </span>
                    <div className="pl-card-info">
                      <p className="pl-card-name">{p.name}</p>
                      <p className="pl-card-desc">{p.desc}</p>
                    </div>
                    <button
                      type="button"
                      className="pl-card-more"
                      title="更多"
                      aria-label="更多"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPluginClick(p);
                      }}
                    >
                      <MoreDots />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {productivity.length > 0 && (
            <div className="pl-section">
              <h3 className="pl-section-title">Productivity</h3>
              <div className="pl-grid">
                {productivity.map((p) => (
                  <div
                    key={p.id}
                    className="pl-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => onPluginClick(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPluginClick(p);
                      }
                    }}
                  >
                    <span className="pl-card-ico" style={{ background: p.color }}>
                      {p.chip}
                    </span>
                    <div className="pl-card-info">
                      <p className="pl-card-name">{p.name}</p>
                      <p className="pl-card-desc">{p.desc}</p>
                    </div>
                    <button
                      type="button"
                      className="pl-card-more"
                      title="更多"
                      aria-label="更多"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPluginClick(p);
                      }}
                    >
                      <MoreDots />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plugins.length === 0 && (
            <div className="pl-section" style={{ textAlign: "center", color: "#6e6e6e", fontSize: 13, padding: 32 }}>
              未找到插件
            </div>
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
