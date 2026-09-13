import { useEffect, useMemo, useState } from "react";
import { buildQrSvg } from "../lib/fake-qr";
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
  { label: string; tag?: string; bind: string; scanLabel: string; scanHint: string }
> = {
  wechat: {
    label: "微信",
    bind: "扫码后自动保存凭据。",
    scanLabel: "扫码",
    scanHint: "用微信扫码并确认登录。",
  },
  feishu: {
    label: "飞书",
    tag: "中国",
    bind: "扫码后自动保存凭据。",
    scanLabel: "扫码",
    scanHint: "用飞书扫码并确认授权。",
  },
  lark: {
    label: "Lark",
    tag: "全球",
    bind: "扫码后自动保存凭据。",
    scanLabel: "扫码",
    scanHint: "用 Lark 扫码并确认授权。",
  },
  telegram: {
    label: "Telegram",
    bind: "扫码后自动保存凭据。",
    scanLabel: "扫码",
    scanHint: "用 Telegram 扫码并确认登录。",
  },
};

const REPLY_DESC: Record<ReplyGrain, string> = {
  standard: "回复助手正文和文件变更，隐藏工具调用过程。",
  brief: "仅回复助手正文，隐藏文件变更与工具过程。",
  verbose: "回复助手正文、文件变更与工具调用过程。",
};

const WORKSPACE_DESC: Record<WorkspaceScope, string> = {
  all: "这个机器人可以使用所有已配置的工作区。",
  current: "这个机器人只能使用当前工作区。",
  selected: "这个机器人只能使用你指定的工作区。",
};

const SEED_BOTS: BotRecord[] = [
  { id: "b1", name: "新机器人", channel: "wechat", enabled: true, bound: false, reply: "standard", workspace: "all" },
  { id: "b2", name: "新机器人", channel: "feishu", enabled: true, bound: false, reply: "standard", workspace: "all" },
  { id: "b3", name: "新机器人", channel: "feishu", enabled: false, bound: false, reply: "standard", workspace: "all" },
];

function isChannel(v: string | null | undefined): v is Channel {
  return v === "wechat" || v === "feishu" || v === "lark" || v === "telegram";
}

export function BotsModal() {
  const open = useShellStore((s) => s.botsOpen);
  const preferred = useShellStore((s) => s.botsPreferredChannel);
  const close = useShellStore((s) => s.closeBots);
  const [bots, setBots] = useState<BotRecord[]>(SEED_BOTS);
  const [activeId, setActiveId] = useState<string | null>("b1");
  const [nextId, setNextId] = useState(4);
  const [scanning, setScanning] = useState(false);
  const [scanSeed, setScanSeed] = useState(0);
  const [scanWaitText, setScanWaitText] = useState("等待扫码");

  const active = bots.find((b) => b.id === activeId) ?? null;
  const meta = active ? CHANNEL_META[active.channel] : CHANNEL_META.wechat;
  const icon = active ? ICONS[active.channel] : ICONS.wechat;
  const scanQr = useMemo(
    () => (scanning ? buildQrSvg(scanSeed) : ""),
    [scanning, scanSeed],
  );

  useEffect(() => {
    if (!open) {
      setScanning(false);
      setScanWaitText("等待扫码");
      return;
    }
    const channel = isChannel(preferred) ? preferred : null;
    const target =
      (channel && bots.find((b) => b.channel === channel)) || bots[0] || null;
    setActiveId(target?.id ?? null);
    setScanning(false);
    setScanWaitText("等待扫码");
    // Only re-select when modal opens / preferred channel changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preferred]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!scanning || !activeId) return;
    const botId = activeId;
    const timer = window.setTimeout(() => {
      setBots((prev) =>
        prev.map((b) => (b.id === botId ? { ...b, bound: true } : b)),
      );
      setScanWaitText("已绑定");
      setScanning(false);
      toast.success("机器人已绑定");
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [scanning, activeId]);

  if (!open) return null;

  const updateActive = (patch: Partial<BotRecord>) => {
    if (!activeId) return;
    setBots((prev) => prev.map((b) => (b.id === activeId ? { ...b, ...patch } : b)));
  };

  const createBot = () => {
    const channel = active?.channel ?? "wechat";
    const bot: BotRecord = {
      id: `b${nextId}`,
      name: "新机器人",
      channel,
      enabled: true,
      bound: false,
      reply: "standard",
      workspace: "all",
    };
    setNextId((n) => n + 1);
    setBots((prev) => [bot, ...prev]);
    setActiveId(bot.id);
    setScanning(false);
    setScanWaitText("等待扫码");
    toast.info("已新建机器人");
  };

  const startScan = () => {
    if (!active) return;
    updateActive({ bound: false });
    setScanSeed((active.id.length * 997 + (Date.now() % 10000)) % 100000);
    setScanWaitText("等待扫码");
    setScanning(true);
  };

  const deleteBot = () => {
    if (!activeId) return;
    const idx = bots.findIndex((b) => b.id === activeId);
    if (idx < 0) return;
    const next = bots.filter((b) => b.id !== activeId);
    setBots(next);
    setScanning(false);
    if (!next.length) {
      setActiveId(null);
      toast.info("已删除机器人");
      return;
    }
    setActiveId(next[Math.min(idx, next.length - 1)].id);
    toast.info("已删除机器人");
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
        <aside className="bm-side" aria-label="机器人列表">
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
                机器人
              </h3>
              <p className="bm-side-sub">把外部聊天工具和 Webhook 接入 CodexPro 机器人。</p>
            </div>
          </div>
          <button type="button" className="bm-new" onClick={createBot}>
            + 新建机器人
          </button>
          <div className="bm-list" role="listbox" aria-label="已配置机器人">
            {bots.map((bot) => {
              const cMeta = CHANNEL_META[bot.channel];
              const cIcon = ICONS[bot.channel];
              return (
                <button
                  key={bot.id}
                  type="button"
                  className={`bm-item${bot.id === activeId ? " is-active" : ""}`}
                  role="option"
                  aria-selected={bot.id === activeId}
                  onClick={() => {
                    setActiveId(bot.id);
                    setScanning(false);
                    setScanWaitText("等待扫码");
                  }}
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
                </button>
              );
            })}
          </div>
        </aside>

        <div className="bm-main">
          <button type="button" className="bm-close" onClick={close} aria-label="关闭">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          {active ? (
            <>
              <div className="bm-detail-head">
                <div
                  className="bm-detail-ico"
                  style={{ background: icon.bg }}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: icon.svg }}
                />
                <div className="bm-detail-text">
                  <h3 className="bm-detail-name">{active.name}</h3>
                  <p className="bm-detail-status">
                    {active.bound ? (
                      <>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        已绑定
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                        未绑定
                      </>
                    )}
                  </p>
                </div>
                <label className="toggle bm-detail-toggle">
                  <input
                    type="checkbox"
                    checked={active.enabled}
                    aria-label="启用机器人"
                    onChange={(e) => updateActive({ enabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="bm-card">
                <div className="bm-row">
                  <div className="bm-row-left">
                    <p className="bm-row-label">关联机器人</p>
                    <p className="bm-row-desc">{meta.bind}</p>
                  </div>
                  <div className="bm-row-value">
                    <button type="button" className="bm-action" onClick={startScan}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7V5a1 1 0 0 1 1-1h2M16 4h2a1 1 0 0 1 1 1v2M20 16v2a1 1 0 0 1-1 1h-2M8 20H6a1 1 0 0 1-1-1v-2" />
                        <rect x="8" y="8" width="8" height="8" rx="1" />
                      </svg>
                      {meta.scanLabel}
                    </button>
                  </div>
                </div>
                {scanning || scanWaitText === "已绑定" ? (
                  <div className="bm-scan-panel is-open">
                    <div className="bm-scan-box">
                      <div
                        className="bm-scan-qr"
                        aria-label="绑定二维码"
                        dangerouslySetInnerHTML={{
                          __html: scanQr || buildQrSvg(scanSeed || 42),
                        }}
                      />
                      <div className="bm-scan-info">
                        <p className="bm-scan-hint">{meta.scanHint}</p>
                        <p className="bm-scan-wait">
                          {scanning ? <span className="bm-scan-spin" aria-hidden="true" /> : null}
                          <span>{scanWaitText}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="bm-card">
                <div className="bm-row">
                  <div className="bm-row-left">
                    <p className="bm-row-label">机器人回复颗粒度</p>
                    <p className="bm-row-desc">{REPLY_DESC[active.reply]}</p>
                  </div>
                  <div className="bm-row-value">
                    <select
                      className="bm-select"
                      aria-label="机器人回复颗粒度"
                      value={active.reply}
                      onChange={(e) =>
                        updateActive({ reply: e.target.value as ReplyGrain })
                      }
                    >
                      <option value="standard">标准回复</option>
                      <option value="brief">精简回复</option>
                      <option value="verbose">完整过程</option>
                    </select>
                  </div>
                </div>
                <div className="bm-row">
                  <div className="bm-row-left">
                    <p className="bm-row-label">工作区访问范围</p>
                    <p className="bm-row-desc">{WORKSPACE_DESC[active.workspace]}</p>
                  </div>
                  <div className="bm-row-value">
                    <select
                      className="bm-select"
                      aria-label="工作区访问范围"
                      value={active.workspace}
                      onChange={(e) =>
                        updateActive({ workspace: e.target.value as WorkspaceScope })
                      }
                    >
                      <option value="all">所有工作区</option>
                      <option value="current">仅当前工作区</option>
                      <option value="selected">指定工作区</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bm-card">
                <div className="bm-row">
                  <div className="bm-row-left">
                    <p className="bm-row-label">删除机器人</p>
                    <p className="bm-row-desc">移除这个机器人。</p>
                  </div>
                  <div className="bm-row-value">
                    <button type="button" className="bm-action danger" onClick={deleteBot}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
                      </svg>
                      删除机器人
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bm-detail-head">
              <div className="bm-detail-text">
                <h3 className="bm-detail-name">暂无机器人</h3>
                <p className="bm-detail-status">点击左侧新建机器人开始配置。</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
