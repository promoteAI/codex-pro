import { useTranslation } from "react-i18next";

export interface ClarifyCardProps {
  id: string;
  question: string;
  options: string[];
  onAnswer: (value: string) => void;
}

export function ClarifyCard({ id, question, options, onAnswer }: ClarifyCardProps) {
  const { t } = useTranslation("home");
  return (
    <div className="shell-card border-codex-border bg-codex-bg p-3 rounded-lg" data-testid={`clarify-${id}`}>
      <div className="font-medium text-codex-text-secondary">❓ {question}</div>
      {options.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className="text-left px-2 py-1 text-xs rounded border-codex-border border hover:bg-codex-hover"
              onClick={() => onAnswer(opt)}
            >
              {i + 1}. {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
