import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../stores/toast";
import { useShellStore } from "../stores/shell";

export function MobileRemoteModal() {
  const { t } = useTranslation("modal");
  const open = useShellStore((s) => s.mobileRemoteOpen);
  const close = useShellStore((s) => s.closeMobileRemote);
  const openBots = useShellStore((s) => s.openBots);
  const link = typeof window !== "undefined" ? window.location.href : "";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(link)
      .then(() => toast.success(t("mobileRemote.copySuccess")))
      .catch(() => toast.info(link));
  };

  const goBots = (channel?: string) => {
    close();
    openBots(channel);
  };

  return (
    <div
      id="mobileRemoteModal"
      className="mr-overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mrTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="mr-modal">
        <div className="mr-head">
          <div className="mr-head-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="2" y="4" width="12" height="9" rx="1.5" />
              <path d="M5 16h6M8 13v3" />
              <rect x="15" y="6" width="7" height="12" rx="1.5" />
              <circle cx="18.5" cy="15.5" r="0.7" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div className="mr-head-text">
            <h3 className="mr-title" id="mrTitle">
              {t("mobileRemote.title")}
            </h3>
            <p className="mr-sub">{t("mobileRemote.subtitle")}</p>
          </div>
          <button type="button" className="mr-close" onClick={close} aria-label={t("mobileRemote.closeAria")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mr-grid">
          <div className="mr-col">
            <div className="mr-col-head">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="8" y="2.5" width="8" height="19" rx="2" />
                <circle cx="12" cy="18.5" r="0.9" fill="currentColor" stroke="none" />
              </svg>
              <h4 className="mr-col-title">{t("mobileRemote.scanTitle")}</h4>
            </div>
            <p className="mr-col-desc">{t("mobileRemote.scanDesc")}</p>

            <div className="mr-status">
              <div className="mr-status-main">
                <div className="mr-status-top">
                  <span className="mr-status-label">{t("mobileRemote.unsupported")}</span>
                  <span className="mr-badge">{t("mobileRemote.unsupportedBadge")}</span>
                </div>
                <p className="mr-status-desc">{t("mobileRemote.unsupportedDesc")}</p>
              </div>
            </div>
            <p className="mr-hint">{t("mobileRemote.unsupportedDesc")}</p>
            <div className="mr-actions">
              <button type="button" className="mr-action" onClick={copyLink}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
                {t("mobileRemote.copyLink")}
              </button>
            </div>
          </div>

          <div className="mr-col">
            <div className="mr-col-head">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="8" width="18" height="10" rx="3" />
                <circle cx="8.5" cy="13" r="1.4" />
                <circle cx="15.5" cy="13" r="1.4" />
                <path d="M12 5v3" />
              </svg>
              <h4 className="mr-col-title">{t("mobileRemote.botTitle")}</h4>
              <button type="button" className="mr-bots-manage" onClick={() => goBots()}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="8" width="12" height="10" rx="3" />
                  <circle cx="9.5" cy="13" r="1.2" />
                  <circle cx="14.5" cy="13" r="1.2" />
                  <path d="M12 4v4M9 18v2M15 18v2" />
                </svg>
                {t("mobileRemote.manageBots")}
              </button>
            </div>
            <p className="mr-col-desc">{t("mobileRemote.botDesc")}</p>
            <div className="mr-bot-list">
              <div className="mr-bot">
                <div className="mr-bot-body">
                  <p className="mr-bot-name">{t("mobileRemote.unsupported")}</p>
                  <p className="mr-bot-desc">{t("mobileRemote.botUnsupported")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
