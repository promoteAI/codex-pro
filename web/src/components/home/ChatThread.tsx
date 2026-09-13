import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";
import { useChatStore, type ChatMessage, type ToolCallFn } from "../../stores/chat";
import { useWsSubscribe } from "../../hooks/use-ws";
import { Markdown } from "./markdown";

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

function actionSummary(text: string, max = 120): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Build the activity body content for a shell/JSON card, splitting cmd/out. */
function shellSegments(text: string): { cmd: string; out: string } {
  const raw = (text ?? "").trim();
  const firstNewline = raw.indexOf("\n");
  if (firstNewline === -1) return { cmd: raw, out: "" };
  return {
    cmd: raw.slice(0, firstNewline),
    out: raw.slice(firstNewline + 1),
  };
}

function ActivityItem({
  title,
  input,
  output,
  running,
  defaultOpen,
}: {
  title: string;
  input?: string;
  output?: string;
  running?: boolean;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation("home");
  const hasInput = Boolean(input?.trim());
  const hasOutput = Boolean(output?.trim());
  const summary = actionSummary(formatJsonish(input ?? "") || output || "");
  const seg = shellSegments(input ?? output ?? "");
  const showCard = (hasInput || hasOutput) && (seg.cmd || seg.out);

  return (
    <div
      className={`act-item ${running ? "is-running is-focus" : ""}`}
      data-tool={title}
    >
      <div className="act-head">
        <span className="act-ico">
          <Wrench size={14} />
        </span>
        <span className="act-verb">{title}</span>
        {running && <span className="ml-auto text-[11.5px] text-[#9ec1ff]">{t("toolRunning", { name: "" })}</span>}
      </div>
      {summary && (
        <details
          className="act-item"
          open={defaultOpen || running}
        >
          <summary className="act-summary">
            <span className="act-chev">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </span>
            <span className="act-summary-text">{summary}</span>
          </summary>
          {(showCard || hasInput || hasOutput) && (
            <div className="act-body">
              {hasInput && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#777] pt-1 pb-1">{t("toolInput")}</div>
                  <div className="shell-card">
                    <div className="shell-label">{title}</div>
                    <pre className="shell-pre">
                      {seg.cmd && <span className="cmd">{truncate(seg.cmd, 4000)}</span>}
                      {seg.out && (
                        <>
                          {seg.cmd && "\n"}
                          <span className="out">{truncate(seg.out, 4000)}</span>
                        </>
                      )}
                    </pre>
                    <span className="shell-badge is-ok">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                      {t("actDone")}
                    </span>
                  </div>
                </div>
              )}
              {hasOutput && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#777] pt-1 pb-1">{t("toolOutput")}</div>
                  <div className="shell-card">
                    <div className="shell-label">{t("toolResult", { name: title })}</div>
                    <pre className="shell-pre">
                      <span className="out">{truncate(formatJsonish(output!), 4000)}</span>
                    </pre>
                    <span className="shell-badge is-ok">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                      {t("actDone")}
                    </span>
                  </div>
                </div>
              )}
              {!hasInput && !hasOutput && (
                <div className="text-[#777] py-2">{t("emptyContent")}</div>
              )}
            </div>
          )}
        </details>
      )}
    </div>
  );
}

/** Render a single tool/activity row. */
function renderActivity(m: ChatMessage, t: (k: string, o?: Record<string, string>) => string): React.ReactNode {
  const title =
    m.name || (m.tool_calls?.[0]?.function?.name) || t("unknownTool");
  if (m.role === "tool") {
    return <ActivityItem title={title} output={m.content} defaultOpen />;
  }
  if (m.tool_calls?.length) {
    return m.tool_calls.map((tc: ToolCallFn) => (
      <ActivityItem
        key={`${m.id}-${tc.id}`}
        title={tc.function?.name || m.name || t("unknownTool")}
        input={tc.function?.arguments || ""}
        defaultOpen
      />
    ));
  }
  if (m.internal) {
    return <ActivityItem title={m.name || t("unknownTool")} output={m.content} defaultOpen />;
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
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-[clamp(16px,4vw,48px)] pb-[200px] pt-5 scrollbar-gutter-stable" aria-label="chat">
      <div className="chat-thread max-w-[760px] mx-auto flex flex-col gap-1.5">
        {loadingHistory && (
          <div className="text-codex-muted text-sm px-2">{t("loadingHistory")}</div>
        )}
        {historyError && (
          <div className="text-codex-danger text-sm px-2">
            {t("historyError", { error: historyError })}
          </div>
        )}

        {/* Group: collect consecutive activity rows into a single chat-turn.
            Activity rows are assistant-with-tool_calls / tool / internal. */}
        {(() => {
          const nodes: React.ReactNode[] = [];
          let turn: React.ReactNode[] = [];
          const pushTurn = () => {
            if (!turn.length) return;
            nodes.push(<div className="chat-turn" key={`turn-${nodes.length}`}>{turn}</div>);
            turn = [];
          };
          messages.forEach((m, idx) => {
            const isActivity =
              m.role === "tool" || m.internal || (m.tool_calls && m.tool_calls.length > 0);
            if (isActivity) {
              const acts = renderActivity(m, t);
              if (acts) {
                if (Array.isArray(acts)) turn.push(...acts);
                else turn.push(acts);
              }
              return;
            }
            // A visible message breaks the activity turn.
            if (m.role === "user" || (m.role === "assistant" && m.content?.trim())) {
              pushTurn();
              if (m.role === "user") {
                nodes.push(
                  <div className="chat-msg is-user" key={idx}>
                    <div className="chat-msg-bubble">{m.content}</div>
                  </div>,
                );
              } else {
                nodes.push(
                  <div className="chat-msg is-assistant" key={idx}>
                    <div className="chat-msg-bubble">
                      <Markdown>{m.content}</Markdown>
                    </div>
                  </div>,
                );
              }
            }
          });
          // Flush trailing activity turn (running tool).
          if (typing && turn.length > 0) pushTurn();
          return nodes;
        })()}

        {typing && (
          <div className="chat-msg is-assistant">
            {activeTool && (
              <div className="inline-flex items-center gap-2 text-[12px] text-[#9a9a9a] px-1 mb-1">
                <Wrench size={12} className="animate-pulse" />
                <span>{t("toolRunning", { name: activeTool })}</span>
              </div>
            )}
            <div className="chat-msg-bubble">
              <span className="chat-cursor" aria-hidden />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
