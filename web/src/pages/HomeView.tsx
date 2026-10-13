import { useEffect } from "react";
import { useParams } from "react-router";
import { useChatStore } from "../stores/chat";
import { HomeHero } from "../components/home/HomeHero";
import { ChatThread, type ChatThreadSelectors } from "../components/home/ChatThread";
import { Composer } from "../components/home/Composer";

export function HomeView() {
  const { sessionId: routeSession } = useParams();
  const chatting = useChatStore((s) => s.chatting);
  const messages = useChatStore((s) => s.messages);
  const loadingHistory = useChatStore((s) => s.loadingHistory);
  const historyError = useChatStore((s) => s.historyError);
  const typing = useChatStore((s) => s.typing);
  const activeTool = useChatStore((s) => s.activeTool);
  const sessionId = useChatStore((s) => s.sessionId);
  const streamStopped = useChatStore((s) => s.streamStopped);
  const streaming = useChatStore((s) => s.streaming);
  const thinkingBlocks = useChatStore((s) => s.thinkingBlocks);
  const pendingApprovals = useChatStore((s) => s.pendingApprovals);
  const pendingClarify = useChatStore((s) => s.pendingClarify);
  const decideApproval = useChatStore((s) => s.decideApproval);
  const answerClarify = useChatStore((s) => s.answerClarify);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);
  const wsReloadHistory = useChatStore((s) => s._wsReloadHistory);

  const selectors: ChatThreadSelectors = {
    messages,
    loadingHistory,
    historyError,
    typing,
    activeTool,
    sessionId,
    streamStopped,
    streaming,
    thinkingBlocks,
    pendingApprovals,
    pendingClarify,
    decideApproval,
    answerClarify,
    loadSessionHistory,
    wsReloadHistory,
  };

  useEffect(() => {
    if (routeSession) {
      void loadSessionHistory(decodeURIComponent(routeSession));
    }
  }, [routeSession, loadSessionHistory]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-codex-bg relative">
      {chatting ? <ChatThread selectors={selectors} /> : <HomeHero />}
      <Composer />
    </div>
  );
}
