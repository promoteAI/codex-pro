import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../stores/chat";
import { HomeHero } from "../components/home/HomeHero";
import { ChatThread } from "../components/home/ChatThread";
import { Composer } from "../components/home/Composer";
import { apiFetch } from "../lib/api";
import { relativeTime } from "../lib/datetime";
import { History } from "lucide-react";

interface SessionItem { key: string; message_count: number; updated_at: string }

const PAGE_SIZE = 8;

export function HomeView() {
  const { t } = useTranslation(["home", "common"]);
  const { sessionId: routeSession } = useParams();
  const chatting = useChatStore((s) => s.chatting);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);
  const clearChat = useChatStore((s) => s.clearChat);

  const [recentSessions, setRecentSessions] = useState<SessionItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    if (routeSession) {
      void loadSessionHistory(decodeURIComponent(routeSession));
    }
  }, [routeSession, loadSessionHistory]);

  useEffect(() => {
    if (!routeSession) {
      // Keep local mock thread if user already chatting on /
      // only clear when navigating to fresh home without messages handled by sidebar
    }
  }, [routeSession, clearChat]);

  const loadRecentSessions = async (offset: number = 0) => {
    setSessionsLoading(true);
    try {
      const result = await apiFetch<{ sessions: SessionItem[]; total: number; has_more: boolean }>(
        `/sessions?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      if (offset === 0) {
        setRecentSessions(result.sessions);
      } else {
        setRecentSessions((prev) => [...prev, ...result.sessions]);
      }
      setHasMore(result.has_more);
    } catch {
      // Silently fail — home page should not break if sessions API is unavailable
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (!chatting) {
      void loadRecentSessions(0);
    }
  }, [chatting]);

  const handleLoadMore = () => {
    const nextOffset = recentSessions.length;
    void loadRecentSessions(nextOffset);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-codex-bg relative">
      {chatting ? (
        <ChatThread />
      ) : (
        <>
          <HomeHero />
          {recentSessions.length > 0 && (
            <div className="mx-auto w-full max-w-2xl px-4 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <History size={14} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("recentSessions")}</span>
              </div>
              <div className="space-y-1">
                {recentSessions.map((session) => (
                  <a
                    key={session.key}
                    href={`/session/${encodeURIComponent(session.key)}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-200 truncate group-hover:text-white">
                        {session.key.split(":").pop() || session.key}
                      </div>
                      <div className="text-xs text-gray-500">
                        {session.message_count} {t("messages")} · {relativeTime(session.updated_at)}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={sessionsLoading}
                  className="w-full mt-2 text-xs text-gray-500 hover:text-gray-300 py-2 transition-colors"
                >
                  {sessionsLoading ? t("loading") : t("loadMore")}
                </button>
              )}
            </div>
          )}
        </>
      )}
      <Composer />
    </div>
  );
}
