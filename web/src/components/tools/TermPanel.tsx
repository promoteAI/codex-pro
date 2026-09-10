import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import { useShellStore } from "../../stores/shell";
import { MOCK_TERM_LINES } from "../../mock/seeds";

interface TermTab {
  id: string;
  label: string;
  lines: string[];
}

let termSeq = 1;

export function TermPanel() {
  const { t } = useTranslation("tools");
  const termOpen = useShellStore((s) => s.termOpen);
  const closeTerm = useShellStore((s) => s.closeTerm);
  const [tabs, setTabs] = useState<TermTab[]>([
    { id: "t1", label: `${t("terminal")} 1`, lines: MOCK_TERM_LINES },
  ]);
  const [activeId, setActiveId] = useState("t1");
  const active = tabs.find((x) => x.id === activeId) ?? tabs[0];

  const addTab = () => {
    termSeq += 1;
    const id = `t${termSeq}`;
    setTabs((prev) => [
      ...prev,
      { id, label: `${t("terminal")} ${termSeq}`, lines: ["$ ", ""] },
    ]);
    setActiveId(id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? "");
      return next;
    });
  };

  return (
    <div
      className={`shrink-0 overflow-hidden border-t border-codex-border bg-codex-panel transition-[height] duration-200 ${
        termOpen ? "h-[min(280px,36vh)]" : "h-0 border-t-0"
      }`}
      aria-hidden={!termOpen}
    >
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-1 px-2 py-1 border-b border-codex-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] shrink-0 ${
                activeId === tab.id
                  ? "bg-[#2e2e2e] text-[#f0f0f0]"
                  : "text-[#9a9a9a] hover:bg-[#252525]"
              }`}
            >
              <span>{tab.label}</span>
              {tabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="opacity-60 hover:opacity-100"
                  aria-label={t("close")}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }
                  }}
                >
                  <X size={11} />
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={addTab}
            className="text-codex-muted hover:text-codex-text p-0.5 shrink-0"
            aria-label={t("termAddTab")}
            title={t("termNewTab")}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={closeTerm}
            className="ml-auto text-codex-muted hover:text-codex-text p-0.5 shrink-0"
            aria-label={t("close")}
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed text-[#c8c8c8] bg-[#121212]">
          {(active?.lines ?? []).map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line || "\u00a0"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
