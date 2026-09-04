import { useTranslation } from "react-i18next";
import { Search, Wrench, RefreshCw, Bug } from "lucide-react";
import { useChatStore } from "../../stores/chat";

const CARDS = [
  { key: "promptExplore" as const, full: "promptExploreFull" as const, icon: Search },
  { key: "promptBuild" as const, full: "promptBuildFull" as const, icon: Wrench },
  { key: "promptReview" as const, full: "promptReviewFull" as const, icon: RefreshCw },
  { key: "promptFix" as const, full: "promptFixFull" as const, icon: Bug },
];

export function HomeHero() {
  const { t } = useTranslation("home");
  const project = useChatStore((s) => s.project);
  const setDraft = useChatStore((s) => s.setDraft);

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-6 pb-4 min-h-0 overflow-auto">
      <div className="w-14 h-14 mb-5 opacity-70" aria-hidden>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <path
            fill="none"
            stroke="#5a5a5a"
            strokeWidth="4.5"
            d="M50 12C38 12 28 19 26 29H22A14 14 0 0 0 8 43a22.5 22.5 0 0 0 22 44h40a20.4 20.4 0 0 0 3.5-40.5A16 16 0 0 0 82 38c0-1.2-.1-2.4-.4-3.5C79.5 21 67 12 50 12Z"
          />
          <path
            fill="none"
            stroke="#5a5a5a"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M42 36L30 52l12 16"
          />
          <rect fill="#5a5a5a" x="48" y="66" width="14" height="5" rx="1.5" />
        </svg>
      </div>
      <h1 className="text-[clamp(16px,2.2vw,22px)] font-semibold text-[#f0f0f0] text-center mb-6 max-w-[640px]">
        {t("heroTitle", { project }).split(project).map((part, i, arr) =>
          i < arr.length - 1 ? (
            <span key={i}>
              {part}
              <em className="not-italic text-codex-accent">{project}</em>
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[560px]">
        {CARDS.map(({ key, full, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDraft(t(full))}
            className="flex items-start gap-3 p-4 bg-codex-surface border border-codex-border rounded-[12px] text-left hover:border-[#3a3a3a] hover:bg-[#222]"
          >
            <Icon size={18} className="text-[#888] shrink-0 mt-0.5" />
            <p className="text-[13.5px] text-[#d4d4d4] leading-snug">{t(key)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
