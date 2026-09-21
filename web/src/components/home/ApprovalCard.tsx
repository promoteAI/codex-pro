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

export function ApprovalCard({ id, tool, params, risk, onDecide }: ApprovalCardProps) {
  const { t } = useTranslation("home");
  const body = formatParams(params);

  return (
    <div className="shell-card border-codex-border bg-codex-bg p-3 rounded-lg" data-testid={`approval-${id}`}>
      <div className="flex items-center gap-2 text-codex-warning">
        <AlertTriangle size={14} />
        <span className="font-medium">{t("approvalRequired", { action: tool })}</span>
        <span className="text-codex-muted text-xs ml-auto">{t("riskLevel", { level: risk })}</span>
      </div>
      {body && <pre className="shell-pre mt-2 text-xs">{body}</pre>}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          className="px-3 py-1 text-xs rounded border-codex-border border"
          onClick={() => onDecide("once")}
        >
          <Check size={12} className="inline mr-1" />
          {t("approveOnce")}
        </button>
        <button
          type="button"
          className="px-3 py-1 text-xs rounded border-codex-border border"
          onClick={() => onDecide("session")}
        >
          {t("approveSession")}
        </button>
        <button
          type="button"
          className="px-3 py-1 text-xs rounded border-codex-border border text-codex-danger"
          onClick={() => onDecide("deny")}
        >
          <X size={12} className="inline mr-1" />
          {t("deny")}
        </button>
      </div>
    </div>
  );
}
