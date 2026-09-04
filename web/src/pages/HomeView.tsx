import { useEffect } from "react";
import { useParams } from "react-router";
import { useChatStore } from "../stores/chat";
import { HomeHero } from "../components/home/HomeHero";
import { ChatThread } from "../components/home/ChatThread";
import { Composer } from "../components/home/Composer";

export function HomeView() {
  const { sessionId: routeSession } = useParams();
  const chatting = useChatStore((s) => s.chatting);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);
  const clearChat = useChatStore((s) => s.clearChat);

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

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-codex-bg relative">
      {chatting ? <ChatThread /> : <HomeHero />}
      <Composer />
    </div>
  );
}
