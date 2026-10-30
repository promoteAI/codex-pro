import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getMeta } from "../../lib/api";

/** Releases page of the upstream project — where a self-hosted user checks
 *  what changed and how to upgrade. */
const RELEASES_URL = "https://github.com/promoteAI/codex-pro/releases";

interface Props {
  open: boolean;
  /** The "检查更新" button — the popover is anchored above it. */
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

/**
 * Update popover for the sidebar "检查更新" button.
 *
 * The gateway has no update-check endpoint (self-hosted installs upgrade by
 * pulling a new release), so instead of pretending to poll a registry this
 * shows the running version from `/meta` and links to the releases page —
 * the same information a manual check would surface, without a dead button.
 */
export function UpdatePopover({ open, anchorRef, onClose }: Props) {
  const { t } = useTranslation("nav");
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        popRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  const anchor = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = anchor
    ? {
        bottom: Math.round(window.innerHeight - anchor.top + 8),
        left: Math.round(Math.max(8, anchor.right - 260)),
      }
    : { bottom: 48, left: 8 };

  const version = getMeta()?.version ?? "";

  return createPortal(
    <div
      ref={popRef}
      className="update-pop open"
      role="dialog"
      aria-label={t("update")}
      style={style}
    >
      <h3>{t("updatePopTitle")}</h3>
      <p>
        {version ? t("updatePopBody", { version }) : t("updatePopBodyNoVersion")}
      </p>
      <div className="update-pop-actions">
        <button type="button" className="update-pop-dismiss" onClick={onClose}>
          {t("updatePopDismiss")}
        </button>
        <a
          className="update-pop-install"
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
        >
          {t("updatePopOpen")}
        </a>
      </div>
    </div>,
    document.body,
  );
}
