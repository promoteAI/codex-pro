import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../stores/chat";

export function ChatThread() {
  const { t } = useTranslation("home");
  const messages = useChatStore((s) => s.messages);
  const loadingHistory = useChatStore((s) => s.loadingHistory);
  const historyError = useChatStore((s) => s.historyError);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4" aria-label="chat">
      <div className="max-w-[720px] mx-auto py-6 space-y-5">
        {loadingHistory && (
          <div className="text-codex-muted text-sm">{t("loadingHistory")}</div>
        )}
        {historyError && (
          <div className="text-codex-danger text-sm">
            {t("historyError", { error: historyError })}
          </div>
        )}
        {messages
          .filter((m) => !m.internal)
          .map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="text-[11.5px] text-[#777] mb-1">
                {m.role === "user" ? t("you") : m.name || t("assistant")}
              </div>
              <div
                className={`max-w-[560px] rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[#2a2a2a] text-[#f0f0f0]"
                    : "bg-transparent text-[#e0e0e0]"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
