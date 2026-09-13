import { useTranslation } from "react-i18next";
import { useChatStore } from "../../stores/chat";

const CARDS = [
  {
    key: "promptExplore" as const,
    full: "promptExploreFull" as const,
    icon: (
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3.5 21C7 14 14 7.5 20.5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M9 3.5 3.5 21l3 .5 4-14 2 .7-.5 2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "promptBuild" as const,
    full: "promptBuildFull" as const,
    icon: (
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
        <path d="m10.5 12 6-6 3.5 3.5-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m15 7-2.5-2.5L8 9.5l3.5 3.5L15 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m9 11-5 5 3.5 3.5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "promptReview" as const,
    full: "promptReviewFull" as const,
    icon: (
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
        <path d="M19 8A8 8 0 0 0 5.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M5 16a8 8 0 0 0 13.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M19 3.5V8h-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 20.5V16h4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "promptFix" as const,
    full: "promptFixFull" as const,
    icon: (
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
        <circle cx="12" cy="4.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <ellipse cx="12" cy="12.5" rx="5" ry="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 6.5v12M7 10.5 4.5 9M7 14H4M7.5 17.5 5 19.5M17 10.5 19.5 9M17 14h3M16.5 17.5 19 19.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
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
      <h1 className="text-[clamp(16px,2.2vw,22px)] font-medium text-[#d4d4d4] text-center mb-6 max-w-[480px]">
        {t("heroTitle", { project }).split(project).map((part, i, arr) =>
          i < arr.length - 1 ? (
            <span key={i}>
              {part}
              <em className="not-italic text-[#a8a8a8]">{project}</em>
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </h1>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-[clamp(8px,1.2vw,16px)] w-full max-w-[680px]">
        {CARDS.map(({ key, full, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDraft(t(full))}
            className="flex items-start gap-3 p-3 border border-codex-border rounded-[12px] text-left hover:border-[#3a3a3a] hover:bg-[#1e1e1e]"
          >
            <span className="text-[#8a8a8a] shrink-0 mt-0.5">{icon}</span>
            <p className="text-[13px] text-[#d4d4d4] leading-snug line-clamp-2 overflow-hidden">{t(key)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
