import { useMemo, useState } from "react";
import { MOCK_PRS } from "../mock/seeds";

export function PrView() {
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [activeId, setActiveId] = useState(MOCK_PRS[0]?.id ?? "");

  const list = useMemo(
    () => MOCK_PRS.filter((p) => (tab === "mine" ? p.tabs.includes("mine") : true)),
    [tab],
  );
  const active = list.find((p) => p.id === activeId) ?? list[0];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-codex-bg overflow-hidden">
      <div className="px-8 pt-7 pb-3">
        <h1 className="text-[22px] font-semibold text-[#e8e8e8]">Pull Requests</h1>
        <div className="flex gap-4 mt-4 border-b border-codex-border">
          {(
            [
              ["all", "全部"],
              ["mine", "我的"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`pb-2 text-[13px] border-b-2 -mb-px ${
                tab === id
                  ? "text-[#e0e0e0] border-[#e0e0e0]"
                  : "text-codex-muted border-transparent hover:text-[#a0a0a0]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="w-[min(340px,40%)] border-r border-codex-border overflow-y-auto">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={`w-full text-left px-5 py-3 border-b border-codex-border ${
                active?.id === p.id ? "bg-[#1e1e1e]" : "hover:bg-codex-hover"
              }`}
            >
              <div className="text-[13.5px] text-[#e0e0e0] font-medium truncate">{p.title}</div>
              <div className="text-[12px] text-codex-muted mt-1 truncate">{p.meta}</div>
              <span
                className={`inline-block mt-1.5 text-[11px] px-1.5 py-0.5 rounded ${
                  p.status === "merged"
                    ? "bg-[#1a2f1a] text-codex-success"
                    : p.status === "draft"
                      ? "bg-[#2a2a2a] text-codex-muted"
                      : "bg-[#1a2744] text-[#7aa2ff]"
                }`}
              >
                {p.status}
              </span>
            </button>
          ))}
          {list.length === 0 && (
            <div className="p-6 text-sm text-codex-muted">没有 Pull Request（mock）</div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-codex-panel">
          {active ? (
            <>
              <h2 className="text-lg font-semibold text-[#e8e8e8] mb-2">{active.title}</h2>
              <p className="text-[12.5px] text-codex-muted mb-4">{active.meta}</p>
              <p className="text-[13.5px] text-[#d4d4d4] leading-relaxed whitespace-pre-wrap">
                {active.body}
              </p>
            </>
          ) : (
            <p className="text-codex-muted text-sm">选择一个 PR</p>
          )}
        </div>
      </div>
    </div>
  );
}
