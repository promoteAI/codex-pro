import { useMemo, useState } from "react";
import { useApi } from "../hooks/use-api";

interface PrItem {
  id: string;
  title: string;
  meta: string;
  tabs: string[];
  body: string;
  status: string;
  url?: string;
  branch?: string;
  default_branch?: string;
}

const badgeClass = (s: string) =>
  s === "open" || s === "MERGED" || s === "merged"
    ? "pr-item-badge open"
    : s === "review" || s === "Review"
      ? "pr-item-badge review"
      : "pr-item-badge";

export function PrView() {
  const [tab, setTab] = useState<"all" | "review" | "mine">("all");
  const [activeId, setActiveId] = useState<string>("");
  const [query, setQuery] = useState("");

  const { data, loading, error } = useApi<{ prs: PrItem[] }>("/prs");
  const prs = useMemo(() => data?.prs ?? [], [data]);

  const list = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return prs.filter((p) => p.title.toLowerCase().includes(q) || p.meta.toLowerCase().includes(q) || p.tabs.includes(tab));
    }
    return prs;
  }, [prs, query, tab]);

  const filtered = useMemo(() => {
    if (tab === "review") return list.filter((p) => p.tabs.includes("review") || p.status === "review");
    if (tab === "mine") return list.filter((p) => p.tabs.includes("mine"));
    return list;
  }, [list, tab]);

  const active = filtered.find((p) => p.id === activeId) ?? filtered[0];

  const badges: Record<string, string> = {
    open: "Open",
    merged: "Merged",
    review: "Review",
    draft: "Draft",
    closed: "Closed",
  };

  return (
    <section className="pr-view" aria-label="Pull Request">
      <div className="pr-list-pane">
        <div className="pr-tabs" role="tablist" aria-label="Pull Request 筛选">
          {([["all", "全部"], ["review", "正在审查"], ["mine", "由我创建"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id}
              className={`pr-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="pr-search-row">
          <div className="pr-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
            <input type="search" placeholder="搜索 Pull Request" aria-label="搜索 Pull Request" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="button" className="pr-filter-btn" title="筛选" aria-label="筛选">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z"/></svg>
          </button>
        </div>
        <div className="pr-list-body" id="prListBody">
          {loading && <div className="pr-list-empty">加载中…</div>}
          {!loading && error && <div className="pr-list-empty">加载失败：{error}</div>}
          {!loading && !error && filtered.length === 0 && <div className="pr-list-empty" id="prListEmpty">未找到 Pull Request</div>}
          {!loading && filtered.map((p) => (
            <button key={p.id} type="button" className={`pr-item ${active?.id === p.id ? "is-active" : ""}`} onClick={() => setActiveId(p.id)}>
              <span className="pr-item-title">{p.title}</span>
              <span className="pr-item-meta">
                <span className={badgeClass(p.status)}>{badges[p.status] ?? p.status}</span>
                <span>{p.meta}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="pr-detail-pane">
        {active ? (
          <div className="pr-detail is-visible" id="prDetail">
            <div className="pr-detail-kicker" id="prDetailKicker">{active.meta}</div>
            <h2 className="pr-detail-title" id="prDetailTitle">{active.title}</h2>
            <div className="pr-detail-meta" id="prDetailMeta"><span>{badges[active.status] ?? active.status}</span></div>
            <div className="pr-detail-body" id="prDetailBody"><p>{active.body}</p></div>
            {active.url && (
              <div className="pr-detail-actions">
                <a href={active.url} target="_blank" rel="noreferrer" style={{ color: "#8b9cff", fontSize: 13 }}>在 GitHub 查看→</a>
              </div>
            )}
          </div>
        ) : (
          <div className="pr-detail-empty" id="prDetailEmpty">选择要查看的 Pull Request</div>
        )}
      </div>
    </section>
  );
}
