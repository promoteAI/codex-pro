import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import { useShellStore } from "../../stores/shell";
import { MOCK_TERM_LINES } from "../../mock/seeds";

export function TermPanel() {
  const { t } = useTranslation("tools");
  const termOpen = useShellStore((s) => s.termOpen);
  const closeTerm = useShellStore((s) => s.closeTerm);

  return (
    <div
      className={`shrink-0 overflow-hidden border-t border-codex-border bg-codex-panel transition-[height] duration-200 ${
        termOpen ? "h-[min(280px,36vh)]" : "h-0 border-t-0"
      }`}
      aria-hidden={!termOpen}
    >
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-codex-border">
          <span className="text-[12.5px] text-[#d0d0d0] font-medium">{t("terminal")}</span>
          <button type="button" className="text-codex-muted hover:text-codex-text p-0.5" aria-label="New">
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={closeTerm}
            className="ml-auto text-codex-muted hover:text-codex-text p-0.5"
            aria-label={t("close")}
          >
            <X size={14} />
          </button>
        </div>
        <pre className="flex-1 overflow-auto px-3 py-2 font-mono text-[12px] text-[#c8c8c8] leading-relaxed">
          {MOCK_TERM_LINES.join("\n")}
          <span className="inline-block w-1.5 h-3.5 bg-[#c8c8c8] ml-0.5 align-middle animate-pulse" />
        </pre>
      </div>
    </div>
  );
}
