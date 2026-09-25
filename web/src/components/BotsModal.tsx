import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../stores/toast";
import { useShellStore } from "../stores/shell";

type Channel = "wechat" | "feishu" | "lark" | "telegram";
type ReplyGrain = "standard" | "brief" | "verbose";
type WorkspaceScope = "all" | "current" | "selected";

interface BotRecord {
  id: string;
  name: string;
  channel: Channel;
  enabled: boolean;
  bound: boolean;
  reply: ReplyGrain;
  workspace: WorkspaceScope;
}

const ICONS: Record<Channel, { bg: string; svg: string }> = {
  wechat: {
    bg: "#1f3d2a",
    svg: '<svg viewBox="0 0 24 24"><path fill="#07C160" d="M9.5 4C5.9 4 3 6.5 3 9.6c0 1.8 1 3.4 2.6 4.5l-.6 2.2 2.4-1.3c.7.2 1.4.3 2.1.3.2 0 .5 0 .7-.1-.2-.5-.3-1.1-.3-1.7 0-2.9 2.8-5.3 6.2-5.3.2 0 .5 0 .7.1C16.2 5.7 13.1 4 9.5 4zm-2.6 3.4c.5 0 .8.4.8.8s-.4.8-.8.8-.8-.4-.8-.8.4-.8.8-.8zm5.2 0c.5 0 .8.4.8.8s-.4.8-.8.8-.8-.4-.8-.8.4-.8.8-.8z"/><path fill="#07C160" d="M20.6 14.1c0-2.4-2.4-4.4-5.3-4.4s-5.3 2-5.3 4.4 2.4 4.4 5.3 4.4c.5 0 1.1-.1 1.6-.2l1.9 1-.5-1.8c1.4-.9 2.3-2.2 2.3-3.4zm-7.1-.7c-.3 0-.6-.3-.6-.6s.3-.6.6-.6.6.3.6.6-.3.6-.6.6zm3.7 0c-.3 0-.6-.3-.6-.6s.3-.6.6-.6.6.3.6.6-.3.6-.6.6z"/></svg>',
  },
  feishu: {
    bg: "#1a2a44",
    svg: '<svg viewBox="0 0 24 24"><path fill="#3370FF" d="M4 6.5C4 5.1 5.1 4 6.5 4h11C18.9 4 20 5.1 20 6.5v7c0 1.4-1.1 2.5-2.5 2.5H13l-3.2 3.2c-.4.4-1.1.1-1.1-.4V16H6.5C5.1 16 4 14.9 4 13.5v-7z"/></svg>',
  },
  lark: {
    bg: "#1a2a44",
    svg: '<svg viewBox="0 0 24 24"><path fill="#00D6B9" d="M4 6.5C4 5.1 5.1 4 6.5 4h11C18.9 4 20 5.1 20 6.5v7c0 1.4-1.1 2.5-2.5 2.5H13l-3.2 3.2c-.4.4-1.1.1-1.1-.4V16H6.5C5.1 16 4 14.9 4 13.5v-7z"/></svg>',
  },
  telegram: {
    bg: "#1a3048",
    svg: '<svg viewBox="0 0 24 24"><path fill="#2AABEE" d="M21.5 4.3 3.8 11.2c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 1.7 5.3c.2.7.4.9 1 .9.6 0 .9-.3 1.2-.6l2.5-2.4 5.2 3.8c1 .5 1.6.2 1.9-1L23 5.6c.3-1.2-.4-1.7-1.5-1.3z"/></svg>',
  },
};

const CHANNEL_META: Record<
  Channel,
  { label: string; tag?: string }
> = {
  wechat: {
    label: "微信",
  },
  feishu: {
    label: "飞书",
    tag: "中国",
  },
  lark: {
    label: "Lark",
    tag: "全球",
  },
  telegram: {
    label: "Telegram",
  },
};

export function BotsModal() {
  const { t } = useTranslation("modal");
  const open = useShellStore((s) => s.botsOpen);
  const close = useShellStore((s) => s.closeBots);
  // 后端未提供机器人能力，初始化为空列表，仅展示占位空态。
  const [bots] = useState<BotRecord[]>([]);

  const icon = ICONS.wechat;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const createBot = () => {
    toast.info(t("bots.createUnsupported"));
  };

  return (
    <div
      id="botsModal"
      className="bm-overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bmSideTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="bm-modal">
        <aside className="bm-side" aria-label={t("bots.listAria")}>
          <div className="bm-side-head">
            <div className="bm-side-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="6" y="8" width="12" height="10" rx="3" />
                <circle cx="9.5" cy="13" r="1.2" />
                <circle cx="14.5" cy="13" r="1.2" />
                <path d="M12 4v4M9 18v2M15 18v2" />
              </svg>
            </div>
            <div>
              <h3 className="bm-side-title" id="bmSideTitle">
                {t("bots.title")}
              </h3>
              <p className="bm-side-sub">{t("bots.subtitle")}</p>
            </div>
          </div>
          <button type="button" className="bm-new" onClick={createBot}>
            + {t("bots.new")}
          </button>
          <div className="bm-list" role="listbox" aria-label={t("bots.listAria")}>
            {bots.map((bot) => {
              const cMeta = CHANNEL_META[bot.channel];
              const cIcon = ICONS[bot.channel];
              return (
                <div
                  key={bot.id}
                  className="bm-item"
                  role="option"
                  aria-selected={false}
                >
                  <span
                    className="bm-item-ico"
                    style={{ background: cIcon.bg }}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: cIcon.svg }}
                  />
                  <span className="bm-item-body">
                    <p className="bm-item-name">{bot.name}</p>
                    <p className="bm-item-meta">
                      {cMeta.label}
                      {cMeta.tag ? <span className="tag">{cMeta.tag}</span> : null}
                    </p>
                  </span>
                  <span className="bm-item-dot" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </aside>

        <div className="bm-main">
          <button type="button" className="bm-close" onClick={close} aria-label={t("bots.closeAria")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          <div className="bm-detail-head">
            <div className="bm-detail-ico" style={{ background: icon.bg }} aria-hidden="true">
              <svg viewBox="0 0 24 24" style={{ width: 24, height: 24 }} dangerouslySetInnerHTML={{ __html: icon.svg }} />
            </div>
            <div className="bm-detail-text">
              <h3 className="bm-detail-name">{t("bots.emptyTitle")}</h3>
              <p className="bm-detail-status">{t("bots.emptyDesc")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
