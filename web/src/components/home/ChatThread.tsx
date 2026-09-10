import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";
import { useChatStore, type ChatMessage, type ToolCallFn } from "../../stores/chat";
import { useWsSubscribe } from "../../hooks/use-ws";

function formatJsonish(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

function ToolTraceCard({
  title,
  input,
  output,
  defaultOpen = false,
}: {
  title: string;
  input?: string;
  output?: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation("home");
  const hasInput = Boolean(input?.trim());
  const hasOutput = Boolean(output?.trim());

  return (
    <details
      open={defaultOpen}
      className="w-full max-w-[560px] rounded-lg border border-[#333] bg-[#1c1c1c] text-[12px] text-[#c8c8c8]"
    >
      <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2 select-none hover:bg-[#242424] rounded-lg">
        <Wrench size={13} className="text-[#888] shrink-0" />
        <span className="truncate font-medium text-[#ddd]">{title}</span>
      </summary>
      <div className="px-3 pb-3 space-y-2 border-t border-[#2e2e2e]">
        {hasInput && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#777] pt-2 pb-1">{t("toolInput")}</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed bg-[#141414] border border-[#2a2a2a] rounded-md p-2 max-h-48 overflow-auto">
              {truncate(formatJsonish(input!))}
            </pre>
          </div>
        )}
        {hasOutput && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#777] pt-1 pb-1">{t("toolOutput")}</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed bg-[#141414] border border-[#2a2a2a] rounded-md p-2 max-h-56 overflow-auto">
              {truncate(output!)}
            </pre>
          </div>
        )}
        {!hasInput && !hasOutput && (
          <div className="text-[#777] py-2">{t("emptyContent")}</div>
        )}
      </div>
    </details>
  );
}

function renderToolMessage(m: ChatMessage, t: (key: string, opts?: Record<string, string>) => string) {
  if (m.role === "tool") {
    return (
      <ToolTraceCard
        key={m.id}
        title={t("toolResult", { name: m.name || t("unknownTool") })}
        output={m.content}
      />
    );
  }

  if (m.tool_calls?.length) {
    return m.tool_calls.map((tc: ToolCallFn) => (
      <ToolTraceCard
        key={`${m.id}-${tc.id}`}
        title={t("toolCall", { name: tc.function?.name || m.name || t("unknownTool") })}
        input={tc.function?.arguments || ""}
      />
    ));
  }

  if (m.internal) {
    // Internal assistant rows without tool_calls (rare) — still fold, avoid fake bubbles.
    return (
      <ToolTraceCard
        key={m.id}
        title={t("toolCall", { name: m.name || t("unknownTool") })}
        output={m.content}
      />
    );
  }

  return null;
}

export function ChatThread() {
  const { t } = useTranslation("home");
  const messages = useChatStore((s) => s.messages);
  const loadingHistory = useChatStore((s) => s.loadingHistory);
  const historyError = useChatStore((s) => s.historyError);
  const typing = useChatStore((s) => s.typing);
  const activeTool = useChatStore((s) => s.activeTool);
  const sessionId = useChatStore((s) => s.sessionId);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);
  const bottomRef = useRef<HTMLDivElement>(null);

  useWsSubscribe(
    ["sessions"],
    (ev) => {
      const payload = ev.payload as { session_key?: string; event_id?: string };
      if (payload.session_key === sessionId && sessionId) {
        void loadSessionHistory(sessionId);
      }
    },
    ["session_message"],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typing, activeTool]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4" aria-label="chat">
      <div className="max-w-[720px] mx-auto py-6 space-y-4">
        {loadingHistory && (
          <div className="text-codex-muted text-sm">{t("loadingHistory")}</div>
        )}
        {historyError && (
          <div className="text-codex-danger text-sm">
            {t("historyError", { error: historyError })}
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "tool" || m.internal || (m.tool_calls && m.tool_calls.length > 0)) {
            return (
              <div key={m.id} className="flex flex-col items-start gap-2">
                {renderToolMessage(m, t)}
              </div>
            );
          }

          if (!m.content?.trim()) return null;

          return (
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
          );
        })}
        {typing && (
          <div className="flex flex-col items-start gap-2">
            {activeTool && (
              <div className="inline-flex items-center gap-2 text-[12px] text-[#9a9a9a] px-1">
                <Wrench size={12} className="animate-pulse" />
                <span>{t("toolRunning", { name: activeTool })}</span>
              </div>
            )}
            <div className="text-[11.5px] text-[#777] mb-1">{t("assistant")}</div>
            <div className="max-w-[560px] rounded-xl px-3.5 py-2.5 bg-transparent">
              <span className="inline-block w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce mr-1" style={{ animationDelay: "0ms" }} />
              <span className="inline-block w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce mr-1" style={{ animationDelay: "150ms" }} />
              <span className="inline-block w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
