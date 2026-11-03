import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, RotateCcw, ChevronLeft, ChevronRight, History } from "lucide-react";
import { useApi } from "../hooks/use-api";
import { useWsSubscribe } from "../hooks/use-ws";
import { apiFetch } from "../lib/api";
import { relativeTime, dateTime } from "../lib/datetime";
import { useIsAdmin } from "../stores/capabilities";
import { useConfirm } from "../components/ConfirmDialog";
import { runMutation } from "../stores/toast";

interface SessionItem { key: string; title?: string; message_count: number; updated_at: string; project?: string }
interface Message {
  role: string;
  content: string;
  internal?: boolean;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
}
interface TurnRun {
  event_id: string; status: string; current_tool: string; error: string;
  created_at: string; completed_at: string; session_key: string;
}

const PAGE_SIZE = 50;
const HISTORY_SIZE = 100;

export function Sessions() {
  const { t } = useTranslation(["sessions", "common"]);
  const confirm = useConfirm();
  const isAdmin = useIsAdmin();
  const [listOffset, setListOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const searchParam = query ? `&q=${encodeURIComponent(query)}` : "";
  const { data, loading, error, refetch } = useApi<{
    sessions: SessionItem[]; total: number; has_more: boolean;
  }>(`/sessions?limit=${PAGE_SIZE}&offset=${listOffset}${searchParam}`);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [turns, setTurns] = useState<TurnRun[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const loadTurns = async (key: string) => {
    try {
      const result = await apiFetch<{ turns: TurnRun[] }>(
        `/sessions/${encodeURIComponent(key)}/turns?limit=30`,
      );
      setTurns(result.turns);
    } catch { setTurns([]); }
  };

  const loadHistory = async (key: string, title?: string) => {
    setSelected(key); setSelectedTitle(title || ""); setHistoryError(null); setHistoryLoading(true);
    const seq = ++seqRef.current;
    try {
      const result = await apiFetch<{ messages: Message[]; has_more: boolean }>(
        `/sessions/${encodeURIComponent(key)}/history?limit=${HISTORY_SIZE}&offset=0`,
      );
      if (seq !== seqRef.current) return;
      setMessages(result.messages); setHasOlder(result.has_more);
      await loadTurns(key);
    } catch (e: unknown) {
      if (seq !== seqRef.current) return;
      setMessages([]); setTurns([]);
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally { if (seq === seqRef.current) setHistoryLoading(false); }
  };

  const loadOlder = async () => {
    if (!selected || historyLoading || !hasOlder) return;
    setHistoryLoading(true);
    try {
      const result = await apiFetch<{ messages: Message[]; has_more: boolean }>(
        `/sessions/${encodeURIComponent(selected)}/history?limit=${HISTORY_SIZE}&offset=${messages.length}`,
      );
      setMessages((current) => [...result.messages, ...current]);
      setHasOlder(result.has_more);
    } catch (e: unknown) { setHistoryError(e instanceof Error ? e.message : String(e)); }
    finally { setHistoryLoading(false); }
  };

  const refreshAll = () => { refetch(); if (selected) loadHistory(selected, selectedTitle); };

  useWsSubscribe(["sessions"], (event) => {
    refetch();
    const payload = event.payload as Partial<TurnRun>;
    if (selected && payload?.session_key === selected) {
      loadTurns(selected);
      if (event.type === "session_reset" || ["completed", "incomplete", "failed", "interrupted"].includes(payload.status ?? "")) {
        loadHistory(selected, selectedTitle);
      }
    }
  }, ["session_turn_updated", "session_reset"]);

  const resetSession = async () => {
    if (!selected) return;
    const ok = await confirm({ title: t("resetTitle"), message: t("resetMessage", { key: selected }),
      confirmLabel: t("reset"), destructive: true });
    if (!ok) return;
    const done = await runMutation(
      () => apiFetch(`/sessions/${encodeURIComponent(selected)}`, { method: "DELETE" }),
      { success: t("resetSuccess"), error: t("resetFailed") },
    );
    if (done) loadHistory(selected);
  };

  const sessions = data?.sessions ?? [];

  return (
    <div className="flex flex-col md:flex-row h-full gap-4">
      <div className="w-full md:w-72 md:shrink-0 flex flex-col md:border-r md:pr-4 max-h-72 md:max-h-none">
        <div className="flex gap-2 mb-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setListOffset(0); }} placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")} className="border border-codex-border rounded px-3 py-1.5 flex-1 min-w-0 bg-codex-surface" />
          <button onClick={refreshAll} aria-label={t("common:refresh")} title={t("common:refresh")}
            className="border border-codex-border rounded px-2 hover:bg-codex-hover shrink-0">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading && <div className="text-codex-muted text-sm px-3 py-2">{t("common:loading")}</div>}
          {error && !loading && <div className="text-codex-danger text-sm px-3 py-2">
            {isAdmin === false || String(error).includes("403") ? t("common:adminOnly") : t("common:loadFailed", { error })}
          </div>}
          {!loading && !error && sessions.length === 0 && <div className="text-codex-muted text-sm px-3 py-2">{t("empty")}</div>}
          {sessions.map((session) => <button key={session.key} onClick={() => loadHistory(session.key, session.title)}
            className={`w-full text-left px-3 py-2 rounded text-sm ${selected === session.key ? "bg-codex-accent/10 text-codex-accent" : "hover:bg-codex-hover"}`}>
            <div className="font-medium truncate" title={session.key}>{session.title || t("untitled")}</div>
            <div className="text-xs text-codex-muted">{t("messageCount", { count: session.message_count,
              time: relativeTime(session.updated_at, t("unknownTime")) })}</div>
          </button>)}
        </div>
        {(data?.total ?? 0) > PAGE_SIZE && <div className="flex justify-between items-center pt-2 text-xs text-codex-muted">
          <button disabled={listOffset === 0} onClick={() => setListOffset(Math.max(0, listOffset - PAGE_SIZE))}
            className="p-1 disabled:opacity-30" aria-label={t("common:previous")}><ChevronLeft size={16} /></button>
          <span>{listOffset + 1}-{Math.min(listOffset + sessions.length, data?.total ?? 0)} / {data?.total}</span>
          <button disabled={!data?.has_more} onClick={() => setListOffset(listOffset + PAGE_SIZE)}
            className="p-1 disabled:opacity-30" aria-label={t("common:next")}><ChevronRight size={16} /></button>
        </div>}
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {selected && <div className="flex items-center gap-2 border-b border-codex-border pb-2 mb-2">
          <div className="min-w-0 flex-1"><div className="font-medium text-sm truncate" title={selected}>{selectedTitle || t("untitled")}</div>
            <div className="text-xs text-codex-muted">{t("turnCount", { count: turns.length })}</div></div>
          <button onClick={resetSession} disabled={isAdmin === false}
            className="flex items-center gap-1 text-xs border border-codex-border rounded px-2 py-1 text-codex-danger hover:bg-codex-danger/10 disabled:opacity-40">
            <RotateCcw size={13} /> {t("reset")}
          </button>
        </div>}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {selected && hasOlder && <button onClick={loadOlder} disabled={historyLoading}
            className="mx-auto flex items-center gap-1 text-xs text-codex-accent hover:underline disabled:opacity-50">
            <History size={13} /> {historyLoading ? t("common:loading") : t("loadOlder")}
          </button>}
          {historyError && <div className="text-codex-danger text-sm text-center mt-10">
            {String(historyError).includes("403") ? t("common:adminOnly") : t("historyFailed", { error: historyError })}
          </div>}
          {!historyError && messages.map((message, index) => {
            if (!message.internal && !(message.tool_calls && message.tool_calls.length)) {
              return (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] md:max-w-[75%] rounded-lg px-4 py-2 text-sm ${message.role === "user" ? "bg-codex-accent text-white" : "bg-codex-hover text-codex-text"}`}>
                    <MarkdownContent content={message.content} />
                  </div>
                </div>
              );
            }

            const blocks: Array<{ key: string; title: string; input?: string; output?: string }> = [];
            if (message.tool_calls?.length) {
              for (const tc of message.tool_calls) {
                blocks.push({
                  key: `${index}-${tc.id}`,
                  title: t("toolCall", { name: tc.function?.name || message.name || t("unknownTool") }),
                  input: tc.function?.arguments || "",
                });
              }
            } else if (message.role === "tool") {
              blocks.push({
                key: `${index}-tool`,
                title: t("toolResult", { name: message.name || t("unknownTool") }),
                output: message.content,
              });
            } else {
              blocks.push({
                key: `${index}-internal`,
                title: t("toolCall", { name: message.name || t("unknownTool") }),
                output: message.content,
              });
            }

            return blocks.map((block) => (
              <details key={block.key} className="mx-auto w-full max-w-[90%] text-xs">
                <summary className="cursor-pointer text-codex-muted hover:text-codex-text py-1">
                  {block.title}
                </summary>
                <div className="mt-1 space-y-2">
                  {block.input?.trim() && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-codex-muted mb-1">{t("toolInput")}</div>
                      <pre className="whitespace-pre-wrap break-words bg-codex-hover border border-codex-border rounded p-2 font-mono">{formatToolPayload(block.input)}</pre>
                    </div>
                  )}
                  {block.output?.trim() && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-codex-muted mb-1">{t("toolOutput")}</div>
                      <pre className="whitespace-pre-wrap break-words bg-codex-hover border border-codex-border rounded p-2 font-mono">{block.output}</pre>
                    </div>
                  )}
                  {!block.input?.trim() && !block.output?.trim() && (
                    <div className="bg-codex-hover border border-codex-border rounded p-2 text-codex-muted">{t("emptyContent")}</div>
                  )}
                </div>
              </details>
            ));
          })}
          {!selected && <div className="text-codex-muted text-center mt-20">{t("selectHint")}</div>}
        </div>
        {selected && turns.length > 0 && <details className="border-t border-codex-border pt-2 mt-2 text-xs">
          <summary className="cursor-pointer text-codex-muted">{t("turnLedger")}</summary>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1">{turns.map((turn) =>
            <div key={turn.event_id} className="flex gap-2 items-start bg-codex-hover rounded p-2">
              <span className={`rounded px-1.5 ${turn.status === "completed" ? "bg-codex-success/10 text-codex-success" : turn.status === "failed" ? "bg-codex-danger/10 text-codex-danger" : "bg-codex-accent/10 text-codex-accent"}`}>{turn.status}</span>
              <span className="flex-1 truncate">{turn.current_tool || turn.error || turn.event_id}</span>
              <span className="text-codex-muted shrink-0">{dateTime(turn.created_at)}</span>
            </div>)}</div>
        </details>}
      </div>
    </div>
  );
}

function formatToolPayload(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function MarkdownContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return <div className="space-y-2 break-words">{parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const body = part.slice(3, -3).replace(/^[^\n]*\n/, "");
      return <pre key={index} className="overflow-x-auto rounded bg-codex-panel text-codex-text p-3 text-xs"><code>{body}</code></pre>;
    }
    return <div key={index} className="whitespace-pre-wrap">{part}</div>;
  })}</div>;
}
