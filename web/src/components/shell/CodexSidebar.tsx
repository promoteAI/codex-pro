import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Search,
  Bell,
  Settings,
  MessageSquarePlus,
  GitPullRequest,
  Clock,
  Puzzle,
  Folder,
  TrendingUp,
  Smartphone,
  RotateCcw,
} from "lucide-react";
import { useShellStore } from "../../stores/shell";
import { useChatStore } from "../../stores/chat";
import { useApi } from "../../hooks/use-api";
import { MOCK_PROJECTS } from "../../mock/seeds";

interface SessionItem {
  key: string;
  message_count: number;
  updated_at: string;
}

export function CodexSidebar() {
  const { t } = useTranslation("nav");
  const navigate = useNavigate();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const openSearch = useShellStore((s) => s.openSearch);
  const openMobileRemote = useShellStore((s) => s.openMobileRemote);
  const openRemoteConnect = useShellStore((s) => s.openRemoteConnect);
  const openSettings = useShellStore((s) => s.openSettings);
  const clearChat = useChatStore((s) => s.clearChat);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);
  const sessionId = useChatStore((s) => s.sessionId);

  const { data } = useApi<{ sessions: SessionItem[] }>("/sessions?limit=20&offset=0");
  const recents = data?.sessions ?? [];

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 h-8 px-3 mx-1 rounded-md text-[13.5px] cursor-pointer ${
      isActive ? "bg-codex-active text-codex-text" : "text-[#b8b8b8] hover:bg-codex-hover hover:text-[#c8c8c8]"
    }`;

  return (
    <aside className="w-[clamp(200px,17vw,260px)] shrink-0 border-r border-codex-border flex flex-col min-h-0 bg-codex-sidebar">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-semibold text-[#e0e0e0]"
          onClick={() => {
            clearChat();
            navigate("/");
          }}
          aria-label={t("appName")}
        >
          {t("appName")}
        </button>
        <div className="flex gap-px">
          <button
            type="button"
            title={t("search")}
            aria-label={t("search")}
            onClick={openSearch}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-codex-text-secondary hover:bg-codex-active"
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            title={t("notifications")}
            aria-label={t("notifications")}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-codex-text-secondary hover:bg-codex-active"
          >
            <Bell size={17} />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-1" aria-label={t("appName")}>
        <NavLink to="/" end className={navClass} onClick={() => clearChat()}>
          <MessageSquarePlus size={17} className="opacity-85 shrink-0" />
          <span className="flex-1">{t("newChat")}</span>
        </NavLink>
        <NavLink to="/prs" className={navClass}>
          <GitPullRequest size={17} className="opacity-85 shrink-0" />
          <span className="flex-1">{t("pullRequests")}</span>
        </NavLink>
        <NavLink to="/scheduled" className={navClass}>
          <Clock size={17} className="opacity-85 shrink-0" />
          <span className="flex-1">{t("scheduled")}</span>
        </NavLink>
        <NavLink to="/plugins" className={navClass}>
          <Puzzle size={17} className="opacity-85 shrink-0" />
          <span className="flex-1">{t("plugins")}</span>
        </NavLink>

        {/* 项目 section header with reorder + add actions */}
        <div className="flex items-center justify-between gap-2 px-2 pt-2.5 pb-1">
          <button
            type="button"
            onClick={() => {}}
            className="text-[11px] text-[#6f6f6f] font-medium tracking-wide shrink-0 inline-flex items-center gap-1 hover:text-[#9a9a9a]"
          >
            {t("projects")}
            <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="inline-flex items-center gap-px shrink-0">
            <button
              type="button"
              title={t("reorder")}
              aria-label={t("reorder")}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#8a8a8a] hover:bg-codex-active hover:text-[#d0d0d0]"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current" aria-hidden="true">
                <circle cx="5" cy="3.5" r="1.15"/><circle cx="11" cy="3.5" r="1.15"/>
                <circle cx="5" cy="8" r="1.15"/><circle cx="11" cy="8" r="1.15"/>
                <circle cx="5" cy="12.5" r="1.15"/><circle cx="11" cy="12.5" r="1.15"/>
              </svg>
            </button>
            <button
              type="button"
              title={t("addProject")}
              aria-label={t("addProject")}
              className="relative w-6 h-6 inline-flex items-center justify-center rounded-md text-[#8a8a8a] hover:bg-codex-active hover:text-[#d0d0d0]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {MOCK_PROJECTS.map((p) => {
          const active = useChatStore.getState().project === p.id;
          return (
            <div
              key={p.id}
              className={`mx-1 flex flex-col px-2 py-1 rounded-md group/row ${
                active ? "bg-[#282828]" : "hover:bg-codex-hover"
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    useChatStore.getState().setProject(p.id);
                    navigate("/");
                  }}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-[13.5px] text-[#c8c8c8] text-left"
                >
                  <Folder size={15} className="text-[#909090] shrink-0" />
                  <span className="truncate">{p.label}</span>
                </button>
                <div className="hidden group-hover/row:inline-flex items-center gap-px shrink-0">
                  <button
                    type="button"
                    title={t("viewFiles")}
                    aria-label={t("viewFiles")}
                    className="w-5 h-5 inline-flex items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 7h11M8 12h11M8 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title={t("newChat")}
                    aria-label={t("newChat")}
                    onClick={() => {
                      useChatStore.getState().setProject(p.id);
                      clearChat();
                      navigate("/");
                    }}
                    className="w-5 h-5 inline-flex items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 8v6M9 11h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
              <span className="text-xs text-codex-muted pl-[22px] pr-1 truncate">{p.subtitle}</span>
            </div>
          );
        })}

        {/* 最近 section header with reorder + new actions */}
        <div className="flex items-center justify-between gap-2 px-2 pt-2.5 pb-1">
          <span className="text-[11px] text-[#6f6f6f] font-medium tracking-wide">{t("recents")}</span>
          <div className="inline-flex items-center gap-px shrink-0">
            <button
              type="button"
              title={t("reorder")}
              aria-label={t("reorder")}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#8a8a8a] hover:bg-codex-active hover:text-[#d0d0d0]"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current" aria-hidden="true">
                <circle cx="5" cy="3.5" r="1.15"/><circle cx="11" cy="3.5" r="1.15"/>
                <circle cx="5" cy="8" r="1.15"/><circle cx="11" cy="8" r="1.15"/>
                <circle cx="5" cy="12.5" r="1.15"/><circle cx="11" cy="12.5" r="1.15"/>
              </svg>
            </button>
            <button
              type="button"
              title={t("newChat")}
              aria-label={t("newChat")}
              onClick={() => {
                clearChat();
                navigate("/");
              }}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#8a8a8a] hover:bg-codex-active hover:text-[#d0d0d0]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8v6M9 11h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {recents.length === 0 && (
          <div className="px-4 py-1 text-xs text-codex-muted">{t("noChat")}</div>
        )}
        {recents.map((s) => {
          const active =
            sessionId === s.key || location.pathname === `/chat/${encodeURIComponent(s.key)}`;
          return (
            <div
              key={s.key}
              className={`mx-1 flex items-center gap-1 px-2 py-1 rounded-md group/row ${
                active ? "bg-[#282828]" : "hover:bg-codex-hover"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  void loadSessionHistory(s.key);
                  navigate(`/chat/${encodeURIComponent(s.key)}`);
                }}
                className="flex-1 min-w-0 text-left"
              >
                <span className="block text-[13.5px] text-[#c8c8c8] truncate">{s.key}</span>
                <span className="block text-xs text-codex-muted truncate">
                  {s.message_count} msgs
                </span>
              </button>
              <button
                type="button"
                title={t("archive")}
                aria-label={t("archive")}
                className="hidden group-hover/row:inline-flex w-5 h-5 shrink-0 items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 flex items-center justify-between px-2.5 py-2 border-t border-[#262626]">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            title={t("account")}
            aria-label={t("account")}
            className="flex items-center gap-2 text-[13px] text-[#a8a8a8] px-1.5 py-1 rounded hover:bg-[#262626]"
          >
            <Settings size={18} className="text-[#888]" />
            <span>custom</span>
          </button>
          {accountOpen && (
            <div
              role="menu"
              className="absolute left-0 bottom-[calc(100%+8px)] z-20 min-w-[220px] p-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl shadow-[0_12px_32px_rgba(0,0,0,.5)]"
            >
              <div className="px-2.5 py-1.5 pb-2 text-[13px] font-medium text-[#f0f0f0]">custom</div>
              <div className="h-px bg-[#3a3a3a] mb-1.5" />
              <button
                type="button"
                role="menuitem"
                onClick={() => openSettings("analytics")}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-[#d8d8d8] hover:bg-[#353535] hover:text-[#f0f0f0]"
              >
                <span className="w-[15px] h-[15px] inline-flex items-center justify-center text-[#3fb950]">
                  <TrendingUp size={15} />
                </span>
                <span className="flex-1">{t("usageStats")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  openRemoteConnect();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-[#d8d8d8] hover:bg-[#353535] hover:text-[#f0f0f0]"
              >
                <span className="w-[15px] h-[15px] inline-flex items-center justify-center text-[#4c8dff]">
                  <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></svg>
                </span>
                <span className="flex-1">{t("remoteConnect")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  openSettings();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] text-[#d8d8d8] hover:bg-[#353535] hover:text-[#f0f0f0]"
              >
                <span className="w-[15px] h-[15px] inline-flex items-center justify-center text-[#888]">
                  <Settings size={15} />
                </span>
                <span className="flex-1">{t("settings")}</span>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title={t("mobileRemote")}
            aria-label={t("mobileRemote")}
            onClick={openMobileRemote}
            className="w-[30px] h-[30px] inline-flex items-center justify-center rounded-lg text-[#e8a04a] hover:bg-[#2a2a2a]"
          >
            <Smartphone size={16} />
          </button>
          <button
            type="button"
            title={t("update")}
            aria-label={t("update")}
            className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#f0f0f0] text-[#181818] text-[12px] font-medium hover:bg-white"
          >
            <RotateCcw size={12} />
            {t("updateShort")}
          </button>
        </div>
      </div>
    </aside>
  );
}
