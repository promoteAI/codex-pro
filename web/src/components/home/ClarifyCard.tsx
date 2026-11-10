import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, X, Send } from "lucide-react";

export interface ClarifyCardProps {
  id: string;
  question: string;
  options: string[];
  onAnswer: (value: string) => void;
}

/**
 * Human-in-the-loop clarify card, restyled after the Lobe multi-step prompt
 * reference: a "Q1" step chip, a 补充说明 (note) field, numbered options with a
 * final free-text "或自己输入…" row, and footer Skip(Esc) / Submit(Enter)
 * actions. Keeps the parent data contract (`id`/`question`/`options`) and the
 * single `onAnswer(value)` reply, so no backend/tool change is required — the
 * selected option, note, and free text are folded into one answer string.
 */
export function ClarifyCard({ id, question, options, onAnswer }: ClarifyCardProps) {
  const { t } = useTranslation("home");
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Focus the card on mount so the Esc / Enter shortcuts work immediately.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const customTrimmed = custom.trim();
  const noteTrimmed = note.trim();
  const primary = customTrimmed || (selected != null ? options[selected] : "");
  const hasContent = Boolean(primary || noteTrimmed);

  const buildAnswer = (): string | null => {
    if (primary && noteTrimmed) return t("clarifyNoted", { answer: primary, note: noteTrimmed });
    if (primary) return primary;
    if (noteTrimmed) return noteTrimmed;
    return null;
  };

  const submit = () => {
    const ans = buildAnswer();
    if (ans) onAnswer(ans);
  };

  const skip = () => onAnswer(t("clarifySkipped"));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      skip();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    // Digit quick-select only outside text inputs, so typing digits in a box
    // still enters characters rather than jumping to an option.
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (idx < options.length) setSelected(idx);
    }
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="flex flex-col overflow-hidden rounded-[14px] border border-codex-border bg-codex-surface shadow-card outline-none"
      data-testid={`clarify-${id}`}
      style={{ animation: "bui-fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}
      onKeyDown={onKeyDown}
    >
      {/* Step chip + note field */}
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] border border-codex-accent/40 bg-codex-accent/10 text-[11px] font-semibold text-codex-accent">
          Q1
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] text-codex-text-secondary focus-within:bg-codex-hover">
          <Pencil size={13} className="shrink-0 text-codex-muted" />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("clarifyNoteLabel")}
            className="min-w-0 flex-1 bg-transparent text-codex-text placeholder:text-codex-muted focus:outline-none"
          />
        </div>
      </div>

      {/* Question */}
      <div className="px-3.5 pt-2.5 text-[14px] font-semibold text-codex-text">{question}</div>

      {/* Numbered options + free-text row */}
      <div className="mt-2 flex flex-col gap-0.5 px-2.5 pb-2.5">
        {options.map((opt, i) => {
          const active = selected === i && !customTrimmed;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSelected(i);
                setCustom("");
              }}
              className={`group flex items-start gap-2.5 rounded-[9px] px-2 py-2 text-left transition-colors duration-100 ${
                active ? "bg-codex-hover" : "hover:bg-codex-hover"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-codex-accent text-white"
                    : "text-codex-muted shadow-[inset_0_0_0_1.5px_var(--color-codex-border-strong)]"
                }`}
              >
                {i + 1}
              </span>
              <span className={`min-w-0 flex-1 text-[13px] leading-snug ${active ? "text-codex-text" : "text-codex-text-secondary"}`}>
                {opt}
              </span>
            </button>
          );
        })}

        {/* Free-text "or enter your own" row */}
        <div
          className={`flex items-center gap-2.5 rounded-[9px] px-2 py-2 transition-colors ${
            customTrimmed ? "bg-codex-hover" : ""
          }`}
        >
          <span
            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-medium transition-colors ${
              customTrimmed
                ? "bg-codex-accent text-white"
                : "text-codex-muted shadow-[inset_0_0_0_1.5px_var(--color-codex-border-strong)]"
            }`}
          >
            {options.length + 1}
          </span>
          <input
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              if (e.target.value) setSelected(null);
            }}
            placeholder={t("clarifyFreeInput")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-codex-text placeholder:text-codex-muted focus:outline-none"
          />
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 border-t border-codex-border px-3.5 py-2.5">
        <button
          type="button"
          onClick={skip}
          className="flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-xs font-medium text-codex-text-secondary hover:bg-codex-hover transition-colors"
        >
          <X size={12} />
          {t("clarifySkip")}
          <kbd className="rounded border border-codex-border bg-codex-bg px-1 text-[10px] text-codex-muted">Esc</kbd>
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!hasContent}
          className="flex h-8 items-center gap-1.5 rounded-[8px] bg-codex-accent px-3 text-xs font-medium text-white hover:bg-codex-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={12} />
          {t("clarifySubmit")}
          <kbd className="rounded border border-white/30 bg-white/15 px-1 text-[10px] text-white/90">Enter</kbd>
        </button>
      </div>
    </div>
  );
}
