import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "../stores/toast";

interface AddMarketModalProps {
  open: boolean;
  onClose: () => void;
}

/** Prototype plAddMarketModal — add a plugin marketplace from Git / local path. */
export function AddMarketModal({ open, onClose }: AddMarketModalProps) {
  const { t } = useTranslation("modal");
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
    toast.info(t("addMarket.unsupported"));
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
            {t("addMarket.title")}
          </h3>
          <button type="button" className="pl-modal-close" aria-label={t("addMarket.closeAria")} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p className="pl-modal-sub">
          {t("addMarket.sub")}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toast.info(t("addMarket.learnMoreComingSoon"));
            }}
          >
            {t("addMarket.learnMore")}
          </a>
        </p>
        <div className="pl-modal-field">
          <label className="pl-modal-label" htmlFor="plMarketSource">
            {t("addMarket.sourceLabel")}
          </label>
          <input
            ref={sourceRef}
            className="pl-modal-input"
            id="plMarketSource"
            type="text"
            placeholder={t("addMarket.sourcePlaceholder")}
            spellCheck={false}
            autoComplete="off"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
        <div className="pl-modal-field">
          <label className="pl-modal-label" htmlFor="plMarketRef">
            {t("addMarket.gitRefLabel")}
          </label>
          <input
            className="pl-modal-input"
            id="plMarketRef"
            type="text"
            placeholder={t("addMarket.refPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        </div>
        <div className="pl-modal-field">
          <label className="pl-modal-label" htmlFor="plMarketSparse">
            {t("addMarket.sparseLabel")}
          </label>
          <textarea
            className="pl-modal-textarea"
            id="plMarketSparse"
            placeholder={t("addMarket.sparsePlaceholder")}
            spellCheck={false}
            value={sparse}
            onChange={(e) => setSparse(e.target.value)}
          />
        </div>
        <div className="pl-modal-foot">
          <button type="button" className="pl-modal-cancel" onClick={onClose}>
            {t("addMarket.cancel")}
          </button>
          <button type="button" className="pl-modal-submit" onClick={submit}>
            {t("addMarket.submit")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
