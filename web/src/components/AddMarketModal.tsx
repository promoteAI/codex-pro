import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "../stores/toast";

interface AddMarketModalProps {
  open: boolean;
  onClose: () => void;
}

/** Prototype plAddMarketModal — add a plugin marketplace from Git / local path. */
export function AddMarketModal({ open, onClose }: AddMarketModalProps) {
  const titleId = useId();
  const sourceRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [ref, setRef] = useState("");
  const [sparse, setSparse] = useState("");

  useEffect(() => {
    if (!open) return;
    setSource("");
    setRef("");
    setSparse("");
    const t = window.setTimeout(() => sourceRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const src = source.trim();
    if (!src) {
      sourceRef.current?.focus();
      toast.info("请填写来源");
      return;
    }
    onClose();
    toast.success(`已添加市场：${src}`);
  };

  return createPortal(
    <div
      className="pl-modal-overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pl-modal">
        <div className="pl-modal-head">
          <h3 className="pl-modal-title" id={titleId}>
            添加插件市场
          </h3>
          <button type="button" className="pl-modal-close" aria-label="关闭" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p className="pl-modal-sub">
          从 GitHub 仓库、Git URL 或本地文件夹添加。
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toast.info("插件市场说明（即将推出）");
            }}
          >
            了解更多
          </a>
        </p>
        <div className="pl-modal-field">
          <label className="pl-modal-label" htmlFor="plMarketSource">
            来源
          </label>
          <input
            ref={sourceRef}
            className="pl-modal-input"
            id="plMarketSource"
            type="text"
            placeholder="openai/plugins 或 git@github.com:org/repo.git"
            spellCheck={false}
            autoComplete="off"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="pl-modal-field">
          <label className="pl-modal-label" htmlFor="plMarketRef">
            Git 引用
          </label>
          <input
            className="pl-modal-input"
            id="plMarketRef"
            type="text"
            placeholder="主分支"
            spellCheck={false}
            autoComplete="off"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        </div>
        <div className="pl-modal-field">
          <label className="pl-modal-label" htmlFor="plMarketSparse">
            稀疏路径
          </label>
          <textarea
            className="pl-modal-textarea"
            id="plMarketSparse"
            placeholder="plugins/codex"
            spellCheck={false}
            value={sparse}
            onChange={(e) => setSparse(e.target.value)}
          />
        </div>
        <div className="pl-modal-foot">
          <button type="button" className="pl-modal-cancel" onClick={onClose}>
            取消
          </button>
          <button type="button" className="pl-modal-submit" onClick={submit}>
            添加市场
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
