import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCode2,
  FolderTree,
  Globe,
  MessageSquare,
  Plus,
  RefreshCw,
  Terminal,
  X,
} from "lucide-react";
import { useShellStore, type ToolPane, type SessionTab } from "../../stores/shell";
import { useChatStore } from "../../stores/chat";
import { apiFetch } from "../../lib/api";
import { Markdown } from "../../components/home/markdown";

const TAB_ICONS: Record<SessionTab["type"], typeof Terminal> = {
  review: FileCode2,
  terminal: Terminal,
  browser: Globe,
  files: FolderTree,
  sidechat: MessageSquare,
};

function Hub() {
  const { t } = useTranslation("tools");
  const openTool = useShellStore((s) => s.openTool);
  const items: Array<{ type: Exclude<ToolPane, "hub">; label: string; kbd: string; icon: typeof Terminal }> = [
    { type: "review", label: t("review"), kbd: "Ctrl+Shift+G", icon: FileCode2 },
    { type: "terminal", label: t("terminal"), kbd: "Ctrl+`", icon: Terminal },
    { type: "browser", label: t("browser"), kbd: "Ctrl+T", icon: Globe },
    { type: "sidechat", label: t("sidechat"), kbd: "Ctrl+Alt+S", icon: MessageSquare },
  ];
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[280px] flex flex-col gap-2.5">
        {items.map(({ type, label, kbd, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => openTool(type)}
            className="flex items-center gap-3 px-3.5 py-3 bg-[#222] border border-codex-border rounded-[10px] text-[#d8d8d8] hover:bg-codex-active hover:border-[#343434] text-left"
          >
            <Icon size={18} className="shrink-0 opacity-90" />
            <span className="flex-1 text-[13.5px] font-medium">{label}</span>
            <kbd className="text-[11.5px] text-[#8a8a8a] bg-[#1a1a1a] border border-[#333] rounded-md px-2 py-0.5 font-mono">
              {kbd}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
}

function colorDiffLine(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-[#3fb950]";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-[#f85149]";
  if (line.startsWith("@@")) return "text-[#79c0ff]";
  return "text-[#c8c8c8]";
}

interface ReviewDiffFile {
  path: string;
  additions: number;
  deletions: number;
  diff: string;
}

interface ReviewDiffResponse {
  base: string;
  branch: string;
  files: ReviewDiffFile[];
}

/** Review pane: shows the real working-tree git diff for the active project.
 *  Files are listed in the side tree; selecting one renders its unified diff. */
function ReviewPane() {
  const { t } = useTranslation("tools");
  const projectPath = useChatStore((s) => s.projectPath);
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<ReviewDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const path = projectPath
      ? `?path=${encodeURIComponent(projectPath)}`
      : "";
    try {
      const res = await apiFetch<ReviewDiffResponse>(`/git/diff${path}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(res);
      setActivePath((prev) =>
        prev && res.files.some((f) => f.path === prev) ? prev : res.files[0]?.path ?? "",
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [projectPath]);

  useEffect(() => {
    void load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  const files = useMemo(
    () => (data?.files ?? []).filter((f) => f.path.toLowerCase().includes(filter.toLowerCase())),
    [data, filter],
  );
  const active = files.find((f) => f.path === activePath) ?? files[0] ?? null;
  const totalAdd = (data?.files ?? []).reduce((s, f) => s + f.additions, 0);
  const totalDel = (data?.files ?? []).reduce((s, f) => s + f.deletions, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-codex-border flex-wrap">
        <span className="text-[12px] text-codex-muted">
          {t("reviewBranch")} <span className="text-[#d8d8d8] font-medium">{data?.branch ?? "—"}</span>
        </span>
        <span className="text-[12px] text-codex-muted">
          {t("reviewBase")} <span className="text-[#d8d8d8] font-medium">{data?.base ?? "—"}</span>
        </span>
        <span className="ml-auto text-[12px] font-mono">
          <span className="text-[#3fb950]">+{totalAdd.toLocaleString()}</span>{" "}
          <span className="text-[#f85149]">-{totalDel.toLocaleString()}</span>
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-[#a8a8a8] hover:bg-[#252525]"
          aria-label={t("reviewRefresh")}
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col border-r border-codex-border">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#262626] text-[12.5px]">
            <FileCode2 size={14} className="text-codex-muted shrink-0" />
            <span className="truncate text-[#e0e0e0] font-medium">{active?.path ?? "—"}</span>
            {active && (
              <span className="ml-auto font-mono text-[11.5px] shrink-0">
                <span className="text-[#3fb950]">+{active.additions}</span>{" "}
                <span className="text-[#f85149]">-{active.deletions}</span>
              </span>
            )}
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[#666] text-[13px]">
              {t("reviewLoading")}
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center text-[#666] text-[13px]">
              {t("reviewError")}
            </div>
          ) : !active ? (
            <div className="flex-1 flex items-center justify-center text-codex-muted text-[13px]">
              {t("reviewEmpty")}
            </div>
          ) : (
            <pre className="flex-1 overflow-auto px-0 py-2 text-[12px] font-mono leading-relaxed">
              {active.diff.split("\n").map((line, i) => (
                <div key={i} className={`px-3 whitespace-pre ${colorDiffLine(line)}`}>
                  {line || " "}
                </div>
              ))}
            </pre>
          )}
        </div>
        <aside className="w-[min(200px,38%)] flex flex-col min-h-0 bg-[#1a1a1a]">
          <div className="m-2.5 mb-2 flex items-center gap-2 px-2.5 py-1.5 bg-[#222] border border-[#2e2e2e] rounded-lg">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("reviewFilter")}
              className="w-full bg-transparent outline-none text-[12px] text-[#c8c8c8]"
              aria-label={t("reviewFilter")}
            />
          </div>
          <div className="flex-1 overflow-auto px-1.5 pb-2">
            {files.length === 0 && (
              <p className="px-2 py-3 text-[12px] text-codex-muted">{t("emptyReview")}</p>
            )}
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setActivePath(f.path)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] mb-0.5 ${
                  activePath === f.path ? "bg-[#2e2e2e] text-[#f0f0f0]" : "text-[#c4c4c4] hover:bg-[#252525]"
                }`}
              >
                <div className="truncate">{f.path.split("/").pop()}</div>
                <div className="font-mono text-[10.5px] text-codex-muted">
                  <span className="text-[#3fb950]">+{f.additions}</span>{" "}
                  <span className="text-[#f85149]">-{f.deletions}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface FileContent {
  path: string;
  name: string;
  content: string;
  size: number;
  truncated: boolean;
}

/** Single-file viewer matching the prototype's `fv` pane: breadcrumb + preview/source
 *  toggle + copy path + open-external. Shows one file's content from the API. */
function FilesPane() {
  const { t } = useTranslation("tools");
  const activeTabId = useShellStore((s) => s.activeTabId);
  const sessionTabs = useShellStore((s) => s.sessionTabs);
  const activeTab = sessionTabs.find((tab) => tab.id === activeTabId);
  const filePath = activeTab?.filePath ?? null;

  const [view, setView] = useState<"preview" | "source">("source");
  const [moreOpen, setMoreOpen] = useState(false);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setFileContent(null);
      setError(null);
      return;
    }
    const { repoPath, filePath: fp } = filePath;
    setLoading(true);
    setError(null);
    void apiFetch<{ entries: never }>(
      `/files/content?repo=${encodeURIComponent(repoPath)}&path=${encodeURIComponent(fp)}`,
    )
      .then((res) => {
        setFileContent(res as unknown as FileContent);
      })
      .catch(() => {
        setError(t("emptyFiles"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filePath, t]);

  const resolvedPath = fileContent?.path ?? "";
  const resolvedName = fileContent?.name ?? (filePath?.filePath ?? "");
  const isMd = resolvedName.split(".").pop()?.toLowerCase() === "md";
  const lines = (fileContent?.content ?? "").split("\n");

  const handleCopyAbs = () => {
    void navigator.clipboard?.writeText(resolvedPath);
    setMoreOpen(false);
  };

  const handleCopyRel = () => {
    void navigator.clipboard?.writeText(resolvedName);
    setMoreOpen(false);
  };

  const handleOpenExt = async () => {
    if (!filePath) return;
    try {
      await apiFetch(`/files/open?repo=${encodeURIComponent(filePath.repoPath)}&path=${encodeURIComponent(filePath.filePath)}`);
    } catch {
      void 0;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Breadcrumb bar: project / file + more (⋯) menu + open external */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#262626] bg-codex-panel">
        <span className="text-[12.5px] text-[#8a8a8a]">{t("filesProject")}</span>
        <span className="text-[#555]" aria-hidden>›</span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#e0e0e0] font-medium min-w-0">
          <FileCode2 size={13} className="shrink-0 opacity-80" />
          <span className="truncate">{resolvedName || "—"}</span>
        </span>
        <span className="flex-1" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label={t("filesMore")}
            title={t("filesMore")}
            className="w-7 h-7 inline-flex items-center justify-center rounded text-[#888] hover:bg-[#2a2a2a] hover:text-[#ddd]"
          >
            <span className="flex items-center gap-0.5">
              <span className="w-1 h-1 rounded-full bg-current" />
              <span className="w-1 h-1 rounded-full bg-current" />
              <span className="w-1 h-1 rounded-full bg-current" />
            </span>
          </button>
          {moreOpen && (
            <div
              className="fixed z-[120] w-[180px] p-1 bg-[#2c2c2c] border border-[#3a3a3a] rounded-lg shadow-[0_10px_28px_rgba(0,0,0,.5)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2.5 py-1.5 text-[11px] text-codex-muted">
                {t(isMd ? "filesCategoryMd" : "filesCategorySource")}
              </div>
              <button
                type="button"
                onClick={() => { setView("preview"); setMoreOpen(false); }}
                className={`block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] ${view === "preview" ? "bg-[#3a3a3a] text-[#f0f0f0]" : "text-[#e8e8e8] hover:bg-[#3a3a3a]"}`}
              >
                {t("filesPreview")}
              </button>
              <button
                type="button"
                onClick={() => { setView("source"); setMoreOpen(false); }}
                className={`block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] ${view === "source" ? "bg-[#3a3a3a] text-[#f0f0f0]" : "text-[#e8e8e8] hover:bg-[#3a3a3a]"}`}
              >
                {t("filesSource")}
              </button>
              <div className="h-px bg-[#3a3a3a] my-1" />
              <button
                type="button"
                onClick={handleCopyAbs}
                className="block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] text-[#e8e8e8] hover:bg-[#3a3a3a]"
              >
                {t("filesCopyAbs")}
              </button>
              <button
                type="button"
                onClick={handleCopyRel}
                className="block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] text-[#e8e8e8] hover:bg-[#3a3a3a]"
              >
                {t("filesCopyRel")}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="w-7 h-7 inline-flex items-center justify-center rounded text-[#888] hover:bg-[#2a2a2a] hover:text-[#ddd]"
          title={t("filesOpen")}
          aria-label={t("filesOpen")}
          onClick={handleOpenExt}
        >
          <ExternalLink size={14} />
        </button>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#666] text-[13px]">
          {t("emptyFiles")}…
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-[#666] text-[13px]">
          {error}
        </div>
      ) : view === "preview" && isMd && fileContent ? (
        <div className="flex-1 overflow-auto min-h-0 px-5 py-5 text-[14px] leading-relaxed text-[#d8d8d8]">
          <Markdown>{fileContent.content}</Markdown>
        </div>
      ) : view === "preview" && !isMd && fileContent ? (
        <div className="flex-1 overflow-auto min-h-0 px-4 py-3 text-[13.5px] leading-relaxed text-[#d8d8d8]">
          <pre className="whitespace-pre-wrap font-sans">{fileContent.content}</pre>
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0 font-mono text-[12.5px] leading-[1.6] bg-[#121212]">
          {lines.map((line, i) => (
            <div key={i} className="flex min-w-max">
              <span className="w-11 shrink-0 text-right pr-3 pl-2 text-[#555] select-none">{i + 1}</span>
              <span className="pr-5 text-[#d4d4d4] whitespace-pre">{line || " "}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrowserPane() {
  const { t } = useTranslation("tools");
  const [urlInput, setUrlInput] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);

  const navigate = () => {
    const raw = urlInput.trim();
    if (!raw) return;
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setPageUrl(normalized);
    setUrlInput(normalized);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-codex-border bg-[#1a1a1a]">
        <button
          type="button"
          disabled
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#666]"
          aria-label={t("browserBack")}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          disabled
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#666]"
          aria-label={t("browserForward")}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => pageUrl && navigate()}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#888] hover:bg-[#2a2a2a]"
          aria-label={t("browserReload")}
        >
          <RefreshCw size={14} />
        </button>
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            navigate();
          }}
        >
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={t("browserUrlPlaceholder")}
            className="w-full bg-[#222] border border-[#2e2e2e] rounded-lg px-3 py-1.5 text-[12.5px] outline-none focus:border-[#3a3a3a]"
            aria-label={t("browserUrlPlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </div>
      <div className="flex-1 overflow-auto flex">
        {!pageUrl ? (
          <div className="m-auto text-center max-w-[320px] px-6 py-8">
            <Globe size={40} className="mx-auto mb-3 text-[#8a8a8a] opacity-80" />
            <p className="text-[18px] font-semibold text-[#e8e8e8] mb-2">{t("browserEmptyTitle")}</p>
            <p className="text-[12.5px] text-[#6e6e6e] leading-relaxed">{t("browserEmptySub")}</p>
          </div>
        ) : (
          <div className="m-auto w-full max-w-[640px] px-6 py-8">
            <div className="bg-[#222] border border-[#2e2e2e] rounded-xl p-5">
              <p className="text-[12px] text-[#6eb6ff] mb-2.5 break-all">{pageUrl}</p>
              <h2 className="text-xl font-semibold text-[#f0f0f0] mb-2.5">{t("browserPageTitle")}</h2>
              <p className="text-[13.5px] leading-relaxed text-[#b8b8b8]">{t("browserPageBody")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SideMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function SidechatPane() {
  const { t } = useTranslation("tools");
  const [messages, setMessages] = useState<SideMsg[]>([]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const user: SideMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    setDraft("");
    setMessages((prev) => [
      ...prev,
      user,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: "（侧边聊天预览）已收到，此对话仅保存在本地会话中。",
      },
    ]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-[280px]">
              <div className="w-[72px] h-[72px] mx-auto mb-4 rounded-full border border-[#3a3a3a] flex items-center justify-center text-[#8a8a8a]">
                <MessageSquare size={34} />
              </div>
              <h2 className="text-lg font-semibold text-[#e8e8e8] mb-2">{t("emptySidechat")}</h2>
              <p className="text-[12.5px] text-[#6e6e6e] leading-relaxed">{t("sidechatSub")}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[92%] px-3 py-2 rounded-xl text-[13px] leading-snug whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? "bg-[#2a2a2a] rounded-br-sm text-[#e0e0e0]"
                      : "bg-[#222] border border-[#2e2e2e] rounded-bl-sm text-[#e0e0e0]"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mx-3.5 mb-3.5 bg-[#1e1e1e] border border-[#2a2a2a] rounded-[14px] overflow-hidden flex flex-col">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={t("sidechatPlaceholder")}
          rows={2}
          className="w-full resize-none bg-transparent border-0 px-3.5 pt-3 pb-1 text-[13px] text-[#d4d4d4] outline-none leading-relaxed"
        />
        <div className="flex items-center gap-2.5 px-2.5 pb-2.5">
          <button
            type="button"
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#888] hover:bg-[#262626]"
            aria-label="+"
          >
            <Plus size={14} />
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={send}
            className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${
              draft.trim() ? "bg-codex-accent text-white" : "bg-[#3a3a3a] text-[#777]"
            }`}
            aria-label="Send"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tab picker popover: lists open tabs with icons + close, plus a quick "new tool" hint. */
function TabPicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("tools");
  const sessionTabs = useShellStore((s) => s.sessionTabs);
  const activeTabId = useShellStore((s) => s.activeTabId);
  const activateTab = useShellStore((s) => s.activateTab);
  const closeTab = useShellStore((s) => s.closeTab);

  return (
    <div
      className="fixed z-[130] w-[min(320px,calc(100vw-24px))] max-h-[min(420px,70vh)] flex flex-col bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl shadow-[0_14px_36px_rgba(0,0,0,.55)] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-[#353535] text-[12px] text-[#8a8a8a]">
        {t("picker")}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-1.5">
        {sessionTabs.length === 0 && (
          <div className="px-3 py-4 text-center text-[12.5px] text-[#777]">{t("emptyTabs")}</div>
        )}
        {sessionTabs.map((tab) => {
          const Icon = TAB_ICONS[tab.type];
          return (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] ${
                activeTabId === tab.id ? "bg-[#3a3a3a] text-[#f0f0f0]" : "text-[#e0e0e0] hover:bg-[#3a3a3a]"
              }`}
            >
              <Icon size={15} className="shrink-0 opacity-90" />
              <button
                type="button"
                onClick={() => {
                  activateTab(tab.id);
                  onClose();
                }}
                className="flex-1 min-w-0 truncate text-left"
              >
                {tab.label}
              </button>
              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                className="w-5 h-5 inline-flex items-center justify-center rounded text-[#777] hover:bg-[#4a4a4a] hover:text-[#ddd] shrink-0"
                aria-label={t("close")}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ToolsPanel() {
  const { t } = useTranslation("tools");
  const toolsOpen = useShellStore((s) => s.toolsOpen);
  const layoutMode = useShellStore((s) => s.layoutMode);
  const activeToolPane = useShellStore((s) => s.activeToolPane);
  const sessionTabs = useShellStore((s) => s.sessionTabs);
  const activeTabId = useShellStore((s) => s.activeTabId);
  const activateTab = useShellStore((s) => s.activateTab);
  const closeTab = useShellStore((s) => s.closeTab);
  const closeOtherTabs = useShellStore((s) => s.closeOtherTabs);
  const closeRightTabs = useShellStore((s) => s.closeRightTabs);
  const showHub = useShellStore((s) => s.showHub);
  const openTerm = useShellStore((s) => s.openTerm);
  const openTool = useShellStore((s) => s.openTool);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [hubMenuOpen, setHubMenuOpen] = useState(false);
  const [menuTabId, setMenuTabId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    const onDoc = () => setPickerOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const width = layoutMode === "full" ? "min(720px,72vw)" : "min(420px,46vw)";

  const openTabMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ top: e.clientY, left: e.clientX });
    setMenuTabId(id);
  };

  return (
    <aside
      className={`shrink-0 overflow-hidden bg-codex-bg flex flex-col min-h-0 border-l border-codex-border transition-[width,opacity] duration-200 ${
        toolsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none border-l-0"
      }`}
      style={{ width: toolsOpen ? width : 0 }}
      aria-hidden={!toolsOpen}
    >
      <div className="h-full flex flex-col min-h-0 min-w-0" style={{ width }}>
        {/* Unified session-tab bar: picker chevron + tabs (+ icon each) + close, with
            reserved spacer so the floating layout toolbar doesn't overlap. */}
        <div className="flex items-stretch border-b border-codex-border bg-codex-panel">
          {sessionTabs.length > 0 && (
            <div className="relative inline-flex shrink-0">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                aria-label={t("picker")}
                title={t("picker")}
                className="w-6 h-6 m-1.5 inline-flex items-center justify-center rounded text-[#777] hover:bg-[#333] hover:text-[#ddd]"
              >
                <ChevronDown size={14} />
              </button>
              {pickerOpen && <TabPicker onClose={() => setPickerOpen(false)} />}
            </div>
          )}
          <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-x-hidden">
            {sessionTabs.length === 0 && (
              <button
                type="button"
                onClick={showHub}
                className="px-2.5 py-1.5 text-[12.5px] text-[#8a8a8a] hover:text-[#dedede] shrink-0"
              >
                {t("hubTitle")}
              </button>
            )}
            {sessionTabs.map((tab) => {
              const Icon = TAB_ICONS[tab.type];
              const isActive = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => activateTab(tab.id)}
                  onContextMenu={(e) => openTabMenu(tab.id, e)}
                  className={`inline-flex items-center gap-1 max-w-[200px] min-w-0 px-2 py-1.5 text-[12.5px] border-t-2 ${
                    isActive
                      ? "bg-[#2e2e2e] text-[#f0f0f0] border-t-[#4c8dff]"
                      : "border-t-transparent text-[#9a9a9a] hover:bg-[#252525] hover:text-[#d0d0d0]"
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }
                    }}
                    className="opacity-60 hover:opacity-100 shrink-0"
                    aria-label={t("close")}
                  >
                    <X size={12} />
                  </span>
                </button>
              );
            })}
          </div>
            <button
              type="button"
              onClick={() => setHubMenuOpen((v) => !v)}
              aria-expanded={hubMenuOpen}
              title={t("newTool")}
              aria-label={t("newTool")}
              className="w-7 h-7 m-1.5 inline-flex items-center justify-center rounded text-[#777] hover:bg-[#333] hover:text-[#ddd] shrink-0"
            >
              <Plus size={14} />
            </button>
            {hubMenuOpen && (
              <div
                className="fixed z-[120] min-w-[168px] p-1 bg-[#2c2c2c] border border-[#3a3a3a] rounded-lg shadow-[0_10px_28px_rgba(0,0,0,.5)]"
                onClick={(e) => e.stopPropagation()}
              >
                {(["review", "terminal", "browser", "sidechat"] as const).map((type) => {
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        openTool(type);
                        setHubMenuOpen(false);
                      }}
                      className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-[#e8e8e8] hover:bg-[#3a3a3a]"
                    >
                      {t(type)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Reserved room for the floating layout toolbar (全屏 / 底部 / 侧栏) */}
          <div className="w-[110px] min-w-[110px] shrink-0 pointer-events-none" aria-hidden />

          {menuTabId && sessionTabs.length > 0 && (
            <div
              className="fixed z-[120] min-w-[168px] p-1 bg-[#2c2c2c] border border-[#3a3a3a] rounded-lg shadow-[0_10px_28px_rgba(0,0,0,.5)]"
              style={menuPos}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  closeOtherTabs(menuTabId);
                  setMenuTabId(null);
                }}
                className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-[#e8e8e8] hover:bg-[#3a3a3a]"
              >
                {t("closeOthers")}
              </button>
              <button
                type="button"
                onClick={() => {
                  closeRightTabs(menuTabId);
                  setMenuTabId(null);
                }}
                className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-[#e8e8e8] hover:bg-[#3a3a3a]"
              >
                {t("closeRight")}
              </button>
              <button
                type="button"
                onClick={() => {
                  closeTab(menuTabId);
                  setMenuTabId(null);
                }}
                className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-[#e8e8e8] hover:bg-[#3a3a3a]"
              >
                {t("close")}
              </button>
            </div>
          )}

        {activeToolPane === "hub" && <Hub />}
        {activeToolPane === "review" && <ReviewPane />}
        {activeToolPane === "browser" && <BrowserPane />}
        {activeToolPane === "files" && <FilesPane />}
        {activeToolPane === "sidechat" && <SidechatPane />}
        {activeToolPane === "terminal" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-codex-muted">
            <p>{t("openTerminal")}</p>
            <button
              type="button"
              onClick={openTerm}
              className="px-3 py-1.5 rounded-md bg-codex-accent text-white text-sm"
            >
              {t("openBottomTerm")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
