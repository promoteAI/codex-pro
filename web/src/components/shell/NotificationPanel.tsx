import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNotificationsStore } from "../../stores/notifications";

/** Title key per event type; unknown types never reach the store. */
const TYPE_TITLE_KEY: Record<string, string> = {
  task_created: "notifTaskCreated",
  task_transitioned: "notifTaskTransitioned",
  task_updated: "notifTaskUpdated",
  channel_updated: "notifChannelUpdated",
  memory_changed: "notifMemoryChanged",
};

/** "3 分钟前" / "3 minutes ago" via the runtime's built-in formatter —
 *  deliberately not lib/datetime, whose date-fns import would pull ~70 KiB
 *  into the entry chunk for one timestamp. */
function relativeLabel(at: number, lng: string): string {
  const diffMs = at - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(diffMs / 86_400_000), "day");
}

interface Props {
  open: boolean;
  /** The bell button — the panel is anchored under it, prototype-style. */
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

/**
 * Dashboard notification panel, opened from the sidebar bell.
 *
 * Rendered into document.body with the prototype's fixed-position
 * `.notif-panel` classes so it is not clipped by the sidebar's overflow.
 * Clicks outside (or Escape) close it; the trigger keeps focus for keyboard
 * users, mirroring the account menu's behaviour.
 */
export function NotificationPanel({ open, anchorRef, onClose }: Props) {
  const { t, i18n } = useTranslation("nav");
  const items = useNotificationsStore((s) => s.items);
  const clear = useNotificationsStore((s) => s.clear);
  const panelRef = useRef<HTMLDivElement>(null);

  // Outside click closes; the trigger and the panel itself are exempt so
  // toggling from the bell and scrolling the list both work.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
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
        top: Math.round(anchor.bottom + 8),
        left: Math.round(Math.min(anchor.left, window.innerWidth - 336)),
      }
    : { top: 48, left: 8 };

  return createPortal(
    <div
      ref={panelRef}
      className="notif-panel open"
      role="dialog"
      aria-label={t("notifications")}
      style={style}
    >
      <div className="flex items-center justify-between">
        <span className="notif-panel-title">{t("notifications")}</span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-[11.5px] text-codex-muted hover:text-codex-text-secondary px-2 py-1"
          >
            {t("notifClear")}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="notif-item">
          <p className="notif-item-sub">{t("notifEmpty")}</p>
        </div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="notif-item">
            <p className="notif-item-title">{t(TYPE_TITLE_KEY[item.type] ?? "notifEmpty")}</p>
            <p className="notif-item-sub">
              {item.label ? `${item.label} · ` : ""}
              {relativeLabel(item.at, i18n.resolvedLanguage ?? "zh")}
            </p>
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}
