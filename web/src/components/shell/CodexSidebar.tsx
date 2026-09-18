import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Search,
  Bell,
  Settings,
  Folder,
  Smartphone,
  ArrowUp,
} from "lucide-react";
import { useShellStore } from "../../stores/shell";
import { useChatStore } from "../../stores/chat";
import { useApi } from "../../hooks/use-api";
import { CreateProjectDialog } from "../CreateProjectDialog";
import { MOCK_RECENTS } from "../../mock/seeds";

interface SessionItem {
  key: string;
  title?: string;
  message_count: number;
  updated_at: string;
  project?: string;
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 17v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CodexSidebar() {
  const { t } = useTranslation("nav");
  const navigate = useNavigate();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const openSearch = useShellStore((s) => s.openSearch);
  const openMobileRemote = useShellStore((s) => s.openMobileRemote);
  const mobileRemoteOpen = useShellStore((s) => s.mobileRemoteOpen);
  const openSettings = useShellStore((s) => s.openSettings);
  const accountWrapRef = useRef<HTMLDivElement>(null);
  const clearChat = useChatStore((s) => s.clearChat);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);
  const sessionId = useChatStore((s) => s.sessionId);
  const project = useChatStore((s) => s.project);
  const repos = useChatStore((s) => s.repos);
  const loadRepos = useChatStore((s) => s.loadRepos);
  const selectProject = useChatStore((s) => s.selectProject);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const kbdAnalytics = isMacPlatform() ? "⌥⌘P" : "Alt+Win+P";
  const kbdSettings = isMacPlatform() ? "⌘," : "Ctrl+,";

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    if (!accountOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!accountWrapRef.current?.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const { data } = useApi<{ sessions: SessionItem[] }>("/sessions?limit=20&offset=0");
  const apiRecents = data?.sessions ?? [];

  // 带 project 的会话归到对应项目行下；project 为空的会话显示在「最近」列表。
  const recents = useMemo(() => {
    if (apiRecents.length > 0) {
      return apiRecents
        .filter((s) => !s.project)
        .map((s) => ({ id: s.key, title: s.title || s.key }));
    }
    return MOCK_RECENTS;
  }, [apiRecents]);

  const goAnalytics = () => {
    setAccountOpen(false);
    openSettings("analytics");
  };
  const goSettings = () => {
    setAccountOpen(false);
    openSettings();
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 h-8 px-3 mx-1 rounded-md text-[13.5px] cursor-pointer ${
      isActive ? "bg-codex-active text-codex-text" : "text-[#b8b8b8] hover:bg-codex-hover hover:text-[#c8c8c8]"
    }`;

  const togglePin = (id: string) => {
    setPinned((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isPinned = (id: string, fallback = false) => pinned[id] ?? fallback;

  return (
    <aside className="w-[clamp(200px,17vw,260px)] shrink-0 border-r border-codex-border flex flex-col min-h-0 bg-codex-sidebar">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-semibold text-[#e0e0e0]"
          onClick={() => {
            clearChat();
            navigate("/");
          }}
          aria-label={t("appName")}
        >
          {t("appName")}
          <svg className="w-3.5 h-3.5 text-[#888]" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
          <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] opacity-85 shrink-0" aria-hidden="true">
            <path
              d="M12.9 5.4 18.6 11c.4.4.4 1 0 1.4l-7.2 7.2a1.4 1.4 0 0 1-2 0l-4-4a1.4 1.4 0 0 1 0-2l7.1-7.2c.5-.5 1.2-.5 1.6-.3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="m8.5 10 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="flex-1">{t("newChat")}</span>
        </NavLink>
        <NavLink to="/prs" className={navClass}>
          <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] opacity-85 shrink-0" aria-hidden="true">
            <circle cx="6.5" cy="6" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="6.5" cy="18" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="17.5" cy="6" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M6.5 8.3v7.4M15.2 6H13a3.5 3.5 0 0 0 0 7h2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="flex-1">{t("pullRequests")}</span>
        </NavLink>
        <NavLink to="/scheduled" className={navClass}>
          <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] opacity-85 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1">{t("scheduled")}</span>
        </NavLink>
        <NavLink to="/plugins" className={navClass}>
          <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] opacity-85 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 3.5v6.3M12 14.2v6.3M3.5 12h6.3M14.2 12h6.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="flex-1">{t("plugins")}</span>
        </NavLink>

        <div className="flex items-center justify-between gap-2 px-2 pt-2.5 pb-1">
          <button
            type="button"
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
                <circle cx="5" cy="3.5" r="1.15" />
                <circle cx="11" cy="3.5" r="1.15" />
                <circle cx="5" cy="8" r="1.15" />
                <circle cx="11" cy="8" r="1.15" />
                <circle cx="5" cy="12.5" r="1.15" />
                <circle cx="11" cy="12.5" r="1.15" />
              </svg>
            </button>
            <button
              type="button"
              title={t("addProject")}
              aria-label={t("addProject")}
              onClick={() => setShowCreateProject(true)}
              className="relative w-6 h-6 inline-flex items-center justify-center rounded-md text-[#8a8a8a] hover:bg-codex-active hover:text-[#d0d0d0]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {repos.map((repo) => {
          return (
            <div
              key={repo.path}
              className="mx-1 flex flex-col px-2 py-1 rounded-md group/row"
            >
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    selectProject(repo);
                    navigate("/");
                  }}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-[13.5px] text-[#c8c8c8] text-left"
                >
                  <Folder size={15} className="text-[#909090] shrink-0" />
                  <span className="truncate">{repo.name}</span>
                </button>
                <div className="hidden group-hover/row:inline-flex items-center gap-px shrink-0">
                  <button
                    type="button"
                    title={t("more")}
                    aria-label={t("more")}
                    className="w-5 h-5 inline-flex items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
                      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
                      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title={t("viewFiles")}
                    aria-label={t("viewFiles")}
                    className="w-5 h-5 inline-flex items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M8 7h11M8 12h11M8 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title={t("newChat")}
                    aria-label={t("newChat")}
                    onClick={() => {
                      selectProject(repo);
                      navigate("/");
                    }}
                    className="w-5 h-5 inline-flex items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4H6l-3 3V11.5A8.4 8.4 0 0 1 11.4 3h1.2A8.4 8.4 0 0 1 21 11.5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <path d="M12 8.5v6M9 11.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {(() => {
                const projectSessions = apiRecents.filter((s) => s.project === repo.path);
                if (projectSessions.length === 0) {
                  return (
                    <span className="text-xs text-codex-muted pl-[22px] pr-1 truncate">
                      {t("noChat")}
                    </span>
                  );
                }
                return projectSessions.map((s) => {
                  const active = sessionId === s.key || location.pathname === `/chat/${encodeURIComponent(s.key)}`;
                  return (
                    <div
                      key={s.key}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md group ${
                        active ? "bg-[#282828]" : "hover:bg-codex-hover"
                      }`}
                    >
                      <button
                        type="button"
                        title={isPinned(s.key) ? t("unpin") : t("pin")}
                        aria-label={isPinned(s.key) ? t("unpin") : t("pin")}
                        aria-pressed={isPinned(s.key)}
                        onClick={() => togglePin(s.key)}
                        className={`w-4 h-4 shrink-0 items-center justify-center rounded ${
                          isPinned(s.key)
                            ? "inline-flex text-[#c8c8c8]"
                            : "hidden group-hover:inline-flex text-[#6a6a6a] hover:text-[#b0b0b0]"
                        }`}
                      >
                        <PinIcon className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void loadSessionHistory(s.key);
                          navigate(`/chat/${encodeURIComponent(s.key)}`);
                        }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="block text-[13.5px] text-[#c8c8c8] truncate">{s.title || s.key}</span>
                      </button>
                      <button
                        type="button"
                        title={t("archive")}
                        aria-label={t("archive")}
                        className="hidden group-hover:inline-flex w-5 h-5 shrink-0 items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
                      >
                        <ArchiveIcon className="w-3 h-3" />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          );
        })}

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
                <circle cx="5" cy="3.5" r="1.15" />
                <circle cx="11" cy="3.5" r="1.15" />
                <circle cx="5" cy="8" r="1.15" />
                <circle cx="11" cy="8" r="1.15" />
                <circle cx="5" cy="12.5" r="1.15" />
                <circle cx="11" cy="12.5" r="1.15" />
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
                <path
                  d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4H6l-3 3V11.5A8.4 8.4 0 0 1 11.4 3h1.2A8.4 8.4 0 0 1 21 11.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path d="M12 8.5v6M9 11.5h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {recents.length === 0 && (
          <div className="px-4 py-1 text-xs text-codex-muted">{t("noChat")}</div>
        )}
        {recents.map((s) => {
          const active =
            sessionId === s.id || location.pathname === `/chat/${encodeURIComponent(s.id)}`;
          return (
            <div
              key={s.id}
              className={`mx-1 flex items-center gap-1 px-2 py-1 rounded-md group/row ${
                active ? "bg-[#282828]" : "hover:bg-codex-hover"
              }`}
            >
              <button
                type="button"
                title={isPinned(s.id) ? t("unpin") : t("pin")}
                aria-label={isPinned(s.id) ? t("unpin") : t("pin")}
                aria-pressed={isPinned(s.id)}
                onClick={() => togglePin(s.id)}
                className={`w-4 h-4 shrink-0 items-center justify-center rounded ${
                  isPinned(s.id)
                    ? "inline-flex text-[#c8c8c8]"
                    : "hidden group-hover/row:inline-flex text-[#6a6a6a] hover:text-[#b0b0b0]"
                }`}
              >
                <PinIcon className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (apiRecents.some((r) => r.key === s.id)) {
                    void loadSessionHistory(s.id);
                    navigate(`/chat/${encodeURIComponent(s.id)}`);
                  } else {
                    clearChat();
                    navigate("/");
                  }
                }}
                className="flex-1 min-w-0 text-left"
              >
                <span className="block text-[13.5px] text-[#c8c8c8] truncate">{s.title}</span>
              </button>
              <button
                type="button"
                title={t("archive")}
                aria-label={t("archive")}
                className="hidden group-hover/row:inline-flex w-5 h-5 shrink-0 items-center justify-center rounded text-[#8a8a8a] hover:bg-[#333] hover:text-[#d8d8d8]"
              >
                <ArchiveIcon className="w-3 h-3" />
              </button>
            </div>
          );
        })}

      </nav>

      <div className="shrink-0 flex items-center justify-between px-2.5 py-2 border-t border-[#262626]">
        <div className="account-wrap relative" ref={accountWrapRef}>
          <button
            type="button"
            id="accountBtn"
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            aria-controls="accountMenu"
            title={t("account")}
            aria-label={t("account")}
            className="account flex items-center gap-2 text-[13px] text-[#a8a8a8] px-1.5 py-1 rounded hover:bg-[#262626]"
          >
            <Settings size={18} className="text-[#888]" />
            <span>custom</span>
          </button>
          {accountOpen && (
            <div
              id="accountMenu"
              role="menu"
              aria-label={t("account")}
              className="account-menu open"
            >
              <div className="account-menu-title">custom</div>
              <div className="account-menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="account-menu-item"
                onClick={goAnalytics}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
                <span className="account-menu-item-label">{t("usageStats")}</span>
                <span className="account-menu-kbd">{kbdAnalytics}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="account-menu-item"
                onClick={goSettings}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M19.2 12a7.2 7.2 0 0 0-.1-1.1l2-1.6-2-3.4-2.4 1a7.2 7.2 0 0 0-1.9-1.1L14.5 3h-5l-.3 2.8a7.2 7.2 0 0 0-1.9 1.1l-2.4-1 2 3.4-2 1.6a7.2 7.2 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-1a7.2 7.2 0 0 0 1.9 1.1l.3 2.8h5l.3-2.8a7.2 7.2 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.6c.1-.4.1-.7.1-1.1Z" />
                </svg>
                <span className="account-menu-item-label">{t("settings")}</span>
                <span className="account-menu-kbd">{kbdSettings}</span>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="mobile-btn-wrap relative">
            <button
              type="button"
              title={t("mobileRemote")}
              aria-label={t("mobileRemote")}
              aria-haspopup="dialog"
              aria-expanded={mobileRemoteOpen}
              onClick={openMobileRemote}
              className={`mobile-btn w-[30px] h-[30px] inline-flex items-center justify-center rounded-lg text-[#e8a04a] hover:bg-[#2a2a2a]${mobileRemoteOpen ? " is-active" : ""}`}
            >
              <Smartphone size={16} />
            </button>
            <div className="mobile-tip" hidden={mobileRemoteOpen} aria-hidden="true">
              <p className="mobile-tip-title">{t("mobileRemoteTipTitle")}</p>
              <p className="mobile-tip-sub">{t("mobileRemoteTipSub")}</p>
            </div>
          </div>
          <button
            type="button"
            title={t("update")}
            aria-label={t("update")}
            className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#f0f0f0] text-[#181818] text-[12px] font-medium hover:bg-white"
          >
            <ArrowUp size={12} strokeWidth={2.4} />
            {t("updateShort")}
          </button>
        </div>
      </div>
      <CreateProjectDialog
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
      />
    </aside>
  );
}
