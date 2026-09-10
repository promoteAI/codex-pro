import { useEffect } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useChatStore } from "../stores/chat";
import { HomeHero } from "../components/home/HomeHero";
import { ChatThread } from "../components/home/ChatThread";
import { Composer } from "../components/home/Composer";

function PlanBanner() {
  const { t } = useTranslation("composer");
  const planMode = useChatStore((s) => s.planMode);
  const planTask = useChatStore((s) => s.planTask);
  const clearPlanMode = useChatStore((s) => s.clearPlanMode);

  if (!planMode) return null;

  return (
    <div className="shrink-0 px-[clamp(16px,4vw,32px)] mb-3">
      <div
        className="max-w-[720px] mx-auto flex items-center gap-2 px-3.5 py-2 bg-[#1e2a3a] border border-[#2a4a6a] rounded-[10px] text-[12.5px] text-[#8eb6ff]"
        role="status"
        aria-live="polite"
      >
        <span className="font-medium text-[#a8d4ff]">{t("planMode")}</span>
        <span className="truncate">{planTask}</span>
        <button
          type="button"
          onClick={clearPlanMode}
          className="ml-auto w-5 h-5 rounded inline-flex items-center justify-center text-[#668] hover:bg-[#253545] hover:text-[#a8d4ff]"
          aria-label={t("planBannerClose")}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

export function HomeView() {
  const { sessionId: routeSession } = useParams();
  const chatting = useChatStore((s) => s.chatting);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);

  useEffect(() => {
    if (routeSession) {
      void loadSessionHistory(decodeURIComponent(routeSession));
    }
  }, [routeSession, loadSessionHistory]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-codex-bg relative">
      {chatting ? <ChatThread /> : <HomeHero />}
      <PlanBanner />
      <Composer />
    </div>
  );
}
