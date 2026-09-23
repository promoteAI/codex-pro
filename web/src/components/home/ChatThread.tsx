import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type ChatMessage, type ToolCallFn, type ApprovalTicket, type ClarifyTicket } from "../../stores/chat";
import { useWsSubscribe } from "../../hooks/use-ws";
import { Markdown } from "./markdown";
import { ApprovalCard } from "./ApprovalCard";
import { ClarifyCard } from "./ClarifyCard";
import { TaskActivityItem } from "./TaskActivityItem";

/** Render a single tool/activity row. */
function renderActivity(
  m: ChatMessage,
  t: (k: string, o?: Record<string, string>) => string,
  activeTool: string | null,
  isRunning: boolean,
): React.ReactNode {
  const title =
    m.name || (m.tool_calls?.[0]?.function?.name) || t("unknownTool");
  const toolName = m.name || m.tool_calls?.[0]?.function?.name;
  const isCurrentTool = toolName === activeTool && isRunning;
  if (m.role === "tool") {
    return <TaskActivityItem title={title} toolName={toolName} output={m.content} running={isCurrentTool} />;
  }
  if (m.tool_calls?.length) {
    return m.tool_calls.map((tc: ToolCallFn) => {
      const tcName = tc.function?.name;
      return (
        <TaskActivityItem
          key={`${m.id}-${tc.id}`}
          title={tcName || title}
          toolName={tcName}
          input={tc.function?.arguments || ""}
          running={tcName === activeTool && isRunning}
        />
      );
    });
  }
  if (m.internal) {
    return <TaskActivityItem title={m.name || t("unknownTool")} toolName={m.name} output={m.content} running={isCurrentTool} />;
  }
  return null;
}

export interface ChatThreadSelectors {
  messages: ChatMessage[];
  loadingHistory: boolean;
  historyError: string | null;
  typing: boolean;
  activeTool: string | null;
  sessionId: string | null;
  streamStopped: boolean;
  pendingApprovals: ApprovalTicket[];
  pendingClarify: ClarifyTicket | null;
  decideApproval: (id: string, level: "once" | "session" | "deny") => void;
  answerClarify: (value: string) => void;
  loadSessionHistory: (sid: string) => Promise<void>;
  wsReloadHistory: (sid: string) => Promise<void>;
}

interface ChatThreadProps {
  selectors: ChatThreadSelectors;
}

export function ChatThread({ selectors }: ChatThreadProps) {
  const { t } = useTranslation("home");
  const {
    messages,
    loadingHistory,
    historyError,
    typing,
    activeTool,
    sessionId,
    streamStopped,
    pendingApprovals,
    pendingClarify,
    decideApproval,
    answerClarify,
    loadSessionHistory,
    wsReloadHistory,
  } = selectors;
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useWsSubscribe(
    ["sessions"],
    (ev) => {
      const payload = ev.payload as { session_key?: string; event_id?: string };
      if (payload.session_key === sessionId && sessionId && typing) {
        void wsReloadHistory(sessionId);
      } else if (payload.session_key === sessionId && sessionId && !streamStopped) {
        void loadSessionHistory(sessionId);
      }
    },
    ["session_message"],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typing, activeTool, pendingApprovals.length, pendingClarify]);

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
              const acts = renderActivity(m, t, activeTool, typing);
              if (acts) {
                if (Array.isArray(acts)) turn.push(...acts);
                else turn.push(acts);
              }
              return;
            }
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
          if (typing && turn.length > 0) pushTurn();
          return nodes;
        })()}

        {typing && (
          <div className="chat-msg is-assistant">
            {activeTool ? (
              <div className="inline-flex items-center gap-2 px-1 mb-1">
                <span className="bui-pixels" aria-hidden>
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 0ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 90ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 180ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 270ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 360ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 450ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 540ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 630ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 720ms infinite" }} />
                </span>
                <span className="bui-shimmer text-[13px]">{t("toolRunning", { name: activeTool })}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2.5 px-1 mb-1">
                <span className="bui-pixels" aria-hidden>
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 0ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 90ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 180ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 270ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 360ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 450ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 540ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 630ms infinite" }} />
                  <span style={{ animation: "bui-pixel-on 650ms ease-in-out 720ms infinite" }} />
                </span>
                <span className="bui-shimmer text-[13px]">{t("thinking")}</span>
              </div>
            )}
            <div className="chat-msg-bubble">
              <span className="chat-cursor" aria-hidden />
            </div>
          </div>
        )}
        {pendingApprovals.map((a) => (
          <ApprovalCard
            key={a.id}
            id={a.id}
            tool={a.tool}
            params={a.params}
            risk={a.risk ?? "exec"}
            onDecide={(level) => decideApproval(a.id, level)}
          />
        ))}
        {pendingClarify && (
          <ClarifyCard
            id={pendingClarify.id}
            question={pendingClarify.question}
            options={pendingClarify.options}
            onAnswer={(v) => answerClarify(v)}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
