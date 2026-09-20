import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProvidersStore } from "../../../stores/providers";

interface AddModelModalProps {
  open: boolean;
  onClose: () => void;
  providerName: string;
  /** 传入则为编辑模式：预填模型 id，标题显示"编辑模型"，保存时重命名 */
  editModelId?: string;
}

const INPUT_TYPES = ["text", "image", "video", "pdf"] as const;
const OUTPUT_TYPES = ["text"] as const;

export function AddModelModal({ open, onClose, providerName, editModelId }: AddModelModalProps) {
  const { t } = useTranslation("settings");
  const addModel = useProvidersStore((s) => s.addModel);
  const renameModel = useProvidersStore((s) => s.renameModel);
  const isEdit = Boolean(editModelId);

  const [modelId, setModelId] = useState("");
  const [contextWindow, setContextWindow] = useState("1000000");
  const [maxOutputTokens, setMaxOutputTokens] = useState("128000");
  const [inputTypes, setInputTypes] = useState<Set<string>>(new Set(["text"]));
  const [outputTypes, setOutputTypes] = useState<Set<string>>(new Set(["text"]));

  useEffect(() => {
    if (open) {
      setModelId(editModelId ?? "");
      setContextWindow("1000000");
      setMaxOutputTokens("128000");
      setInputTypes(new Set(["text"]));
      setOutputTypes(new Set(["text"]));
    }
  }, [open, editModelId]);

  const toggleInputType = (type: string) => {
    setInputTypes((prev) => {
      const next = new Set(prev);
      if (type === "text") return prev; // locked
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSave = async () => {
    const id = modelId.trim();
    if (!id) return;
    try {
      if (isEdit && editModelId) {
        await renameModel(providerName, editModelId, id);
      } else {
        await addModel(providerName, id);
      }
      handleClose();
    } catch {
      // error shown by toast
    }
  };

  const handleClose = () => {
    setModelId("");
    setContextWindow("1000000");
    setMaxOutputTokens("128000");
    setInputTypes(new Set(["text"]));
    setOutputTypes(new Set(["text"]));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={onClose}>
      <div
        className="bg-codex-surface border border-codex-border rounded-xl w-[480px] p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="addModelTitle"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-codex-text" id="addModelTitle">
            {isEdit ? t("editModel") : t("addModel")}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
            className="w-7 h-7 rounded-md grid place-items-center text-codex-muted hover:bg-codex-surface-raised hover:text-codex-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <Field label={t("modelId")}>
          <input
            className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder={t("modelId")}
            spellCheck={false}
            autoFocus
          />
        </Field>

        <Field label={t("contextWindow")}>
          <input
            className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent font-mono"
            type="text"
            inputMode="numeric"
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value.replace(/\D/g, ""))}
          />
        </Field>

        <Field label={t("maxOutputTokens")}>
          <input
            className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent font-mono"
            type="text"
            inputMode="numeric"
            value={maxOutputTokens}
            onChange={(e) => setMaxOutputTokens(e.target.value.replace(/\D/g, ""))}
          />
        </Field>

        <Field label={t("inputType")}>
          <ChipRow
            types={INPUT_TYPES}
            selected={inputTypes}
            locked={new Set(["text"])}
            onToggle={toggleInputType}
            t={t}
          />
        </Field>

        <Field label={t("outputType")}>
          <ChipRow
            types={OUTPUT_TYPES}
            selected={outputTypes}
            locked={new Set(["text"])}
            onToggle={() => {}}
            t={t}
          />
        </Field>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg text-[13px] text-codex-muted hover:bg-codex-surface-raised"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!modelId.trim()}
            className="px-3 py-1.5 rounded-lg text-[13px] bg-codex-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="block text-[12px] text-codex-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ChipRow({
  types,
  selected,
  locked,
  onToggle,
  t,
}: {
  types: readonly string[];
  selected: Set<string>;
  locked: Set<string>;
  onToggle: (type: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((type) => {
        const isLocked = locked.has(type);
        const isSelected = selected.has(type);
        return (
          <button
            key={type}
            type="button"
            disabled={isLocked}
            onClick={() => !isLocked && onToggle(type)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] border transition ${
              isLocked
                ? "bg-codex-accent/20 border-codex-accent/40 text-codex-accent cursor-default"
                : isSelected
                  ? "bg-codex-accent/20 border-codex-accent/50 text-codex-accent"
                  : "border-codex-border-input text-codex-muted hover:bg-codex-surface-raised"
            }`}
            aria-pressed={isSelected}
          >
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="m5 12 5 5 9-10" />
              </svg>
            )}
            {type === "text" ? "文本" : type === "image" ? t("image") : type === "video" ? "视频" : "PDF"}
            {isLocked && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
