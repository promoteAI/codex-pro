import { useToastStore } from "../stores/toast";
import { useTranslation } from "react-i18next";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

const STYLE = {
  success: {
    icon: <CheckCircle size={16} />,
    cls: "bg-[#1a2f1a] text-codex-success border-codex-success/30",
  },
  error: {
    icon: <AlertCircle size={16} />,
    cls: "bg-[#2f1a1a] text-codex-danger border-codex-danger/30",
  },
  info: {
    icon: <Info size={16} />,
    cls: "bg-[#1a2744] text-[#7aa2ff] border-codex-accent/30",
  },
} as const;

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  const { t } = useTranslation("common");

  return (
    // role=status + aria-live: without them a toast appearing was completely
    // invisible to assistive technology, which is where most of this app's
    // success/failure feedback lands.
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
    >
      {toasts.map((toast) => {
        const s = STYLE[toast.kind];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm shadow-sm ${s.cls}`}
          >
            <span className="mt-0.5 shrink-0">{s.icon}</span>
            <span className="flex-1 break-words">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label={t("close")}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
