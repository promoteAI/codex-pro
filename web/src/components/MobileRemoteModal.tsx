import { useEffect, useMemo, useState } from "react";
import { buildQrSvg } from "../lib/fake-qr";
import { toast } from "../stores/toast";
import { useShellStore } from "../stores/shell";

interface Bot {
  key: string;
  name: string;
  tag?: string;
  desc: string;
  bg: string;
  node: string;
}

const BOTS: Bot[] = [
  {
    key: "wechat",
    name: "微信",
    desc: "从微信会话打开这个工作区。",
    bg: "#1f3d2a",
    node:
      '<path fill="#07C160" d="M9.5 4C5.9 4 3 6.5 3 9.6c0 1.8 1 3.4 2.6 4.5l-.6 2.2 2.4-1.3c.7.2 1.4.3 2.1.3.2 0 .5 0 .7-.1-.2-.5-.3-1.1-.3-1.7 0-2.9 2.8-5.3 6.2-5.3.2 0 .5 0 .7.1C16.2 5.7 13.1 4 9.5 4zm-2.6 3.4c.5 0 .8.4.8.8s-.4.8-.8.8-.8-.4-.8-.8.4-.8.8-.8zm5.2 0c.5 0 .8.4.8.8s-.4.8-.8.8-.8-.4-.8-.8.4-.8.8-.8z"/><path fill="#07C160" d="M20.6 14.1c0-2.4-2.4-4.4-5.3-4.4s-5.3 2-5.3 4.4 2.4 4.4 5.3 4.4c.5 0 1.1-.1 1.6-.2l1.9 1-.5-1.8c1.4-.9 2.3-2.2 2.3-3.4zm-7.1-.7c-.3 0-.6-.3-.6-.6s.3-.6.6-.6.6.3.6.6-.3.6-.6.6zm3.7 0c-.3 0-.6-.3-.6-.6s.3-.6.6-.6.6.3.6.6-.3.6-.6.6z"/>',
  },
  {
    key: "feishu",
    name: "飞书",
    tag: "[中国]",
    desc: "从飞书打开这个工作区。",
    bg: "#1a2a44",
    node: '<path fill="#3370FF" d="M4 6.5C4 5.1 5.1 4 6.5 4h11C18.9 4 20 5.1 20 6.5v7c0 1.4-1.1 2.5-2.5 2.5H13l-3.2 3.2c-.4.4-1.1.1-1.1-.4V16H6.5C5.1 16 4 14.9 4 13.5v-7z"/>',
  },
  {
    key: "lark",
    name: "Lark",
    tag: "[全球]",
    desc: "从 Lark 打开这个工作区。",
    bg: "#1a2a44",
    node: '<path fill="#00D6B9" d="M4 6.5C4 5.1 5.1 4 6.5 4h11C18.9 4 20 5.1 20 6.5v7c0 1.4-1.1 2.5-2.5 2.5H13l-3.2 3.2c-.4.4-1.1.1-1.1-.4V16H6.5C5.1 16 4 14.9 4 13.5v-7z"/>',
  },
  {
    key: "telegram",
    name: "Telegram",
    desc: "从 Telegram 打开这个工作区。",
    bg: "#1a3048",
    node: '<path fill="#2AABEE" d="M21.5 4.3 3.8 11.2c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 1.7 5.3c.2.7.4.9 1 .9.6 0 .9-.3 1.2-.6l2.5-2.4 5.2 3.8c1 .5 1.6.2 1.9-1L23 5.6c.3-1.2-.4-1.7-1.5-1.3z"/>',
  },
];

export function MobileRemoteModal() {
  const open = useShellStore((s) => s.mobileRemoteOpen);
  const close = useShellStore((s) => s.closeMobileRemote);
  const openBots = useShellStore((s) => s.openBots);
  const [seed, setSeed] = useState(42);
  const [waiting, setWaiting] = useState(true);
  const qr = useMemo(() => buildQrSvg(seed), [seed]);
  const link = typeof window !== "undefined" ? window.location.href : "";

  useEffect(() => {
    if (!open) return;
    setSeed(Math.floor(Math.random() * 100000));
    setWaiting(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const refreshQr = () => {
    setSeed(Date.now() % 100000);
    setWaiting(true);
    toast.info("已刷新二维码");
  };

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(link)
      .then(() => toast.success("已复制链接"))
      .catch(() => toast.info(link));
  };

  const stopWaiting = () => {
    setWaiting(false);
    toast.info("已停止等待连接");
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
              移动端远程控制
            </h3>
            <p className="mr-sub">扫码或在手机上打开链接，即可远程控制当前工作区。</p>
          </div>
          <button type="button" className="mr-close" onClick={close} aria-label="关闭">
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
              <h4 className="mr-col-title">手机扫码连接</h4>
            </div>
            <p className="mr-col-desc">用手机相机扫码，在手机上打开这个工作区。</p>

            <div className="mr-status">
              <div className="mr-status-main">
                <div className="mr-status-top">
                  <span className="mr-status-label">
                    {waiting ? "等待手机连接" : "已停止等待"}
                  </span>
                  <span className="mr-badge">{waiting ? "已就绪" : "已停止"}</span>
                </div>
                <p className="mr-status-desc">
                  {waiting ? "用手机扫码，或在手机上打开链接。" : "可刷新二维码后重新等待连接。"}
                </p>
              </div>
              {waiting ? (
                <button type="button" className="mr-stop" onClick={stopWaiting}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    <path d="m4 4 16 16" />
                  </svg>
                  停止
                </button>
              ) : null}
            </div>
            <div className="mr-qr-wrap">
              <div
                className="mr-qr"
                aria-label="连接二维码"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            </div>
            <p className="mr-hint">无法扫码？可以在手机上打开链接。</p>
            <div className="mr-actions">
              <button type="button" className="mr-action" onClick={refreshQr}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.6-6.3" />
                  <path d="M21 3v6h-6" />
                </svg>
                刷新二维码
              </button>
              <button type="button" className="mr-action" onClick={copyLink}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
                复制链接
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
              <h4 className="mr-col-title">使用 Bot Channel</h4>
              <button type="button" className="mr-bots-manage" onClick={() => goBots()}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="8" width="12" height="10" rx="3" />
                  <circle cx="9.5" cy="13" r="1.2" />
                  <circle cx="14.5" cy="13" r="1.2" />
                  <path d="M12 4v4M9 18v2M15 18v2" />
                </svg>
                机器人管理
              </button>
            </div>
            <p className="mr-col-desc">连接聊天 Bot，适合更长时间的移动端访问。</p>
            <div className="mr-bot-list">
              {BOTS.map((b) => (
                <div
                  key={b.key}
                  className="mr-bot"
                  role="button"
                  tabIndex={0}
                  onClick={() => goBots(b.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goBots(b.key);
                    }
                  }}
                >
                  <div className="mr-bot-ico" style={{ background: b.bg }} aria-hidden="true">
                    <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: b.node }} />
                  </div>
                  <div className="mr-bot-body">
                    <p className="mr-bot-name">
                      {b.name}
                      {b.tag ? <span className="tag">{b.tag}</span> : null}
                    </p>
                    <p className="mr-bot-desc">{b.desc}</p>
                    <button
                      type="button"
                      className="mr-bot-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        goBots(b.key);
                      }}
                    >
                      去 Bot Channels 配置
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
