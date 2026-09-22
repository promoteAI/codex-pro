import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, X } from "lucide-react";

export interface ApprovalCardProps {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  risk: string;
  onDecide: (level: "once" | "session" | "deny") => void;
}

function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params ?? {});
  if (!entries.length) return "";
  return entries
    .map(([k, v]) => `${k}=${String(v).slice(0, 120)}`)
    .join("\n");
}

/**
 * Human-in-the-loop approval card. Visual language borrowed from
 * beautifului.dev approval-card.tsx (card surface + risk accent + pill
 * actions), but keeps Codex Pro's data contract and decision semantics.
 */
export function ApprovalCard({ id, tool, params, risk, onDecide }: ApprovalCardProps) {
  const { t } = useTranslation("home");
  const body = formatParams(params);
  const isHigh = risk === "exec" || risk === "dangerous";

  return (
    <div
      className="overflow-hidden rounded-[14px] border border-codex-border bg-codex-surface shadow-card"
      data-testid={`approval-${id}`}
      style={{ animation: "bui-fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <span
          className={`flex size-6 items-center justify-center rounded-full ${
            isHigh ? "bg-red-tint text-codex-danger" : "bg-accent-tint text-codex-accent"
          }`}
        >
          <AlertTriangle size={14} />
        </span>
        <span className="font-medium text-codex-text-secondary text-[13px]">
          {t("approvalRequired", { action: tool })}
        </span>
        <span className="text-codex-muted text-xs ml-auto">{t("riskLevel", { level: risk })}</span>
      </div>
      {body && <pre className="shell-pre mt-2.5 mx-3.5 text-xs text-codex-text-secondary">{body}</pre>}
      <div className="flex gap-2 px-3.5 py-3">
        <button
          type="button"
          className="flex-1 h-8 px-3 text-xs rounded-[8px] bg-codex-accent text-white hover:bg-codex-accent-hover font-medium"
          onClick={() => onDecide("once")}
        >
          <Check size={12} className="inline mr-1" />
          {t("approveOnce")}
        </button>
        <button
          type="button"
          className="flex-1 h-8 px-3 text-xs rounded-[8px] border border-codex-border hover:bg-codex-hover text-codex-text-secondary"
          onClick={() => onDecide("session")}
        >
          {t("approveSession")}
        </button>
        <button
          type="button"
          className="flex-1 h-8 px-3 text-xs rounded-[8px] border border-codex-border text-codex-danger hover:bg-codex-hover"
          onClick={() => onDecide("deny")}
        >
          <X size={12} className="inline mr-1" />
          {t("deny")}
        </button>
      </div>
    </div>
  );
}
