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

export interface HomeHeroProps {
  project?: string;
  setDraft?: (draft: string) => void;
}

export function HomeHero({ project, setDraft }: HomeHeroProps = {}) {
  const { t } = useTranslation("home");
  const defaultProject = useChatStore((s) => s.project);
  const defaultSetDraft = useChatStore((s) => s.setDraft);
  const resolvedProject = project ?? defaultProject;
  const resolvedSetDraft = setDraft ?? defaultSetDraft;
  const titleText = resolvedProject ? t("heroTitle", { project: resolvedProject }) : t("heroTitleNoProject");

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-6 pb-4 min-h-0 overflow-auto">
      <div className="w-14 h-14 mb-5 opacity-70" aria-hidden>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* 代码框架：C 形外壳，开口朝右 */}
          <path
            fill="none"
            stroke="#5a5a5a"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M64 28H38q-8 0-8 8v28q0 8 8 8h26"
          />
          {/* 执行提示符 `>`：agent 在框架内运行 */}
          <path
            fill="none"
            stroke="#5a5a5a"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M42 42 58 50 42 58"
          />
          {/* 开口处的信号点：输出 / 活跃状态 */}
          <circle fill="#5a5a5a" cx="70" cy="50" r="4" />
        </svg>
      </div>
      <h1 className="text-[clamp(16px,2.2vw,22px)] font-medium text-codex-text text-center mb-6 max-w-[480px]">
        {titleText.split(resolvedProject).map((part, i, arr) =>
          i < arr.length - 1 ? (
            <span key={i}>
              {part}
              <em className="not-italic text-codex-muted">{resolvedProject}</em>
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
            onClick={() => resolvedSetDraft(t(full))}
            className="flex items-start gap-3 p-3 border border-codex-border rounded-[12px] text-left hover:border-codex-border-strong hover:bg-codex-hover"
          >
            <span className="text-codex-muted shrink-0 mt-0.5">{icon}</span>
            <p className="text-[13px] text-codex-text-secondary leading-snug line-clamp-2 overflow-hidden">{t(key)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
