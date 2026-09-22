export interface ClarifyCardProps {
  id: string;
  question: string;
  options: string[];
  onAnswer: (value: string) => void;
}

const ICO_CHEVRON = (
  <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
    <path d="M9 10l-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICO_OK = (
  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Human-in-the-loop clarify card. Visual language borrowed from
 * beautifului.dev approval-card.tsx (card surface + option list + pill
 * actions), but keeps Codex Pro's numbered options and onAnswer contract.
 */
export function ClarifyCard({ id, question, options, onAnswer }: ClarifyCardProps) {
  return (
    <div
      className="overflow-hidden rounded-[14px] border border-codex-border bg-codex-surface shadow-card"
      data-testid={`clarify-${id}`}
      style={{ animation: "bui-fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <div className="px-3.5 pt-3 text-[13.5px] font-medium text-codex-text">
        ❓ {question}
      </div>
      {options.length > 0 && (
        <div className="mt-1.5 px-2 pb-2.5 flex flex-col gap-0.5">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className="group flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-codex-text-secondary hover:bg-codex-hover hover:text-codex-text transition-colors duration-100"
              onClick={() => onAnswer(opt)}
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-[5px] shadow-[inset_0_0_0_1.5px_var(--color-codex-border-strong)] text-transparent group-hover:text-codex-muted transition-colors duration-200">
                {ICO_OK}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {i + 1}. {opt}
              </span>
              <span className="shrink-0 text-codex-muted opacity-0 group-hover:opacity-100 transition-opacity">
                {ICO_CHEVRON}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
