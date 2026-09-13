import { useMemo, useState } from "react";
import { useApi } from "../hooks/use-api";
import { Skills } from "./Skills";

interface MarketplaceItem {
  name: string;
  scope: string;
  desc: string;
  version?: string;
  author?: string;
}

// deterministic tint from name for the plugin chip
const chipColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palette = ["#24292f", "#0f9d58", "#4285f4", "#f4b400", "#ea4335", "#7c4dff", "#00c853", "#ff6d00", "#0091ea", "#c2185b", "#455a64", "#6a1b9a"];
  return palette[h % palette.length];
};

export function PluginsView() {
  const [tab, setTab] = useState<"plugins" | "skills">("plugins");
  const [scope, setScope] = useState<"plugin-all" | "plugin-installed" | "plugin-public">("plugin-all");
  const [q, setQ] = useState("");

  const { data: skillsData, loading: skillsLoading, error: skillsError } = useApi<{ skills: MarketplaceItem[] }>("/skills");

  const market = useMemo(() => {
    const items = skillsData?.skills ?? [];
    return items.filter((p) => {
      if (scope === "plugin-installed" && p.scope !== "installed") return false;
      if (scope === "plugin-public" && p.scope !== "public") return false;
      if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.desc.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [scope, q, skillsData]);

  return (
    <section className="pl-view" aria-label="插件市场">
      <div className="pl-top">
        <div className="pl-tabs" role="tablist" aria-label="插件与技能">
          <button type="button" role="tab" aria-selected={tab === "plugins"}
            className={`pl-tab ${tab === "plugins" ? "active" : ""}`}
            onClick={() => setTab("plugins")}>插件</button>
          <button type="button" role="tab" aria-selected={tab === "skills"}
            className={`pl-tab ${tab === "skills" ? "active" : ""}`}
            onClick={() => setTab("skills")}>技能</button>
        </div>
        <div className="pl-top-actions">
          <button type="button" className="pl-icon-btn" title="刷新" aria-label="刷新">
            <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>
          </button>
        </div>
      </div>
      <div className="pl-body">
        {tab === "plugins" && (
          <div className="pl-plugins-panel" id="plPluginsPanel" style={{ display: "block" }}>
            <div className="pl-search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
              <input type="search" placeholder="搜索插件" aria-label="搜索插件" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="pl-filters" role="tablist" aria-label="插件来源">
              {([["plugin-all", "全部"], ["plugin-installed", "已安装"], ["plugin-public", "公开"]] as const).map(([id, label]) => (
                <button key={id} type="button" className={`pl-filter ${scope === id ? "active" : ""}`} onClick={() => setScope(id)}>{label}</button>
              ))}
            </div>
            {skillsLoading && <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 40 }}>加载中…</div>}
            {!skillsLoading && skillsError && <div style={{ color: "#e85d5d", fontSize: 13, textAlign: "center", padding: 40 }}>加载失败：{skillsError}</div>}
            {!skillsLoading && !skillsError && (
              <div className="pl-section">
                <h3 className="pl-section-title">已安装 / 公开</h3>
                <div className="pl-grid">
                  {market.map((p) => (
                    <div key={p.name} className="pl-card" role="button" tabIndex={0}>
                      <span className="pl-card-ico" style={{ background: chipColor(p.name) }}>
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="pl-card-info">
                        <p className="pl-card-name">{p.name}</p>
                        <p className="pl-card-desc">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                  {market.length === 0 && (
                    <div style={{ color: "#6e6e6e", fontSize: 13, textAlign: "center", padding: 32 }}>未找到插件</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === "skills" && (
          <div className="pl-skills-panel" id="plSkillsPanel" style={{ display: "block" }}>
            <Skills />
          </div>
        )}
      </div>
    </section>
  );
}
