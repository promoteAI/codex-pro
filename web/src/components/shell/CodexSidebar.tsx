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
  LogOut,
} from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { useAuthRequired } from "../../stores/capabilities";
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
  const { t, i18n } = useTranslation("nav");
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const authRequired = useAuthRequired();
  const openSearch = useShellStore((s) => s.openSearch);
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

        <div className="px-4 pt-2.5 pb-1 text-[11px] text-[#6f6f6f] font-medium tracking-wide">
          {t("projects")}
        </div>
        {MOCK_PROJECTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              useChatStore.getState().setProject(p.id);
              navigate("/");
            }}
            className="w-[calc(100%-8px)] mx-1 flex flex-col px-2 py-1 rounded-md text-left hover:bg-codex-hover"
          >
            <span className="flex items-center gap-1.5 text-[13.5px] text-[#c8c8c8]">
              <Folder size={15} className="text-[#909090] shrink-0" />
              {p.label}
            </span>
            <span className="text-xs text-codex-muted pl-[22px] truncate">{p.subtitle}</span>
          </button>
        ))}

        <div className="px-4 pt-2.5 pb-1 text-[11px] text-[#6f6f6f] font-medium tracking-wide">
          {t("recents")}
        </div>
        {recents.length === 0 && (
          <div className="px-4 py-1 text-xs text-codex-muted">{t("noChat")}</div>
        )}
        {recents.map((s) => {
          const active =
            sessionId === s.key || location.pathname === `/chat/${encodeURIComponent(s.key)}`;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                void loadSessionHistory(s.key);
                navigate(`/chat/${encodeURIComponent(s.key)}`);
              }}
              className={`w-[calc(100%-8px)] mx-1 flex flex-col px-2 py-1 rounded-md text-left ${
                active ? "bg-[#282828]" : "hover:bg-codex-hover"
              }`}
            >
              <span className="text-[13.5px] text-[#c8c8c8] truncate">{s.key}</span>
              <span className="text-xs text-codex-muted pl-0 truncate">
                {s.message_count} msgs
              </span>
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 flex items-center justify-between px-2.5 py-2 border-t border-[#262626]">
        <button
          type="button"
          onClick={() => openSettings()}
          className="flex items-center gap-2 text-[13px] text-[#a8a8a8] px-1.5 py-1 rounded hover:bg-[#262626]"
          aria-label={t("settings")}
          title={t("settings")}
        >
          <Settings size={18} className="text-[#888]" />
          <span>custom</span>
        </button>
        <div className="flex items-center gap-1">
          {(["zh", "en"] as const).map((lng) => (
            <button
              key={lng}
              type="button"
              onClick={() => i18n.changeLanguage(lng)}
              className={`text-[11px] px-1.5 py-0.5 rounded ${
                i18n.resolvedLanguage === lng
                  ? "bg-codex-accent text-white"
                  : "text-codex-muted hover:bg-codex-active"
              }`}
            >
              {lng === "zh" ? t("langZh") : t("langEn")}
            </button>
          ))}
          {authRequired !== false && (
            <button
              type="button"
              onClick={logout}
              title={t("logout")}
              aria-label={t("logout")}
              className="w-6 h-6 rounded-full border border-[#555] text-[#888] inline-flex items-center justify-center hover:bg-[#262626]"
            >
              <LogOut size={12} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
