import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileCode2,
  Folder,
  FolderTree,
  Globe,
  MessageSquare,
  Plus,
  RefreshCw,
  Terminal,
  X,
} from "lucide-react";
import { useShellStore, type ToolPane } from "../../stores/shell";
import { useApi } from "../../hooks/use-api";
import {
  MOCK_DIFF,
  MOCK_FILE_PREVIEW,
  MOCK_REVIEW_FILES,
} from "../../mock/seeds";

function Hub() {
  const { t } = useTranslation("tools");
  const openTool = useShellStore((s) => s.openTool);
  const items: Array<{ type: Exclude<ToolPane, "hub">; label: string; kbd: string; icon: typeof Terminal }> = [
    { type: "review", label: t("review"), kbd: "Ctrl+Shift+G", icon: FileCode2 },
    { type: "terminal", label: t("terminal"), kbd: "Ctrl+`", icon: Terminal },
    { type: "browser", label: t("browser"), kbd: "Ctrl+T", icon: Globe },
    { type: "files", label: t("files"), kbd: "Ctrl+P", icon: FolderTree },
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

function ReviewPane() {
  const { t } = useTranslation("tools");
  const [filter, setFilter] = useState("");
  const [activePath, setActivePath] = useState(MOCK_REVIEW_FILES[0]?.path ?? "");

  const files = useMemo(
    () =>
      MOCK_REVIEW_FILES.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase())),
    [filter],
  );
  const active = MOCK_REVIEW_FILES.find((f) => f.path === activePath) ?? files[0];
  const totalAdd = MOCK_REVIEW_FILES.reduce((s, f) => s + f.add, 0);
  const totalDel = MOCK_REVIEW_FILES.reduce((s, f) => s + f.del, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-codex-border flex-wrap">
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a] text-[12px] text-[#c0c0c0]"
        >
          {t("reviewBranch")} <ChevronDown size={12} />
        </button>
        <div className="text-[12px] font-mono">
          <span className="text-[#3fb950]">+{totalAdd.toLocaleString()}</span>{" "}
          <span className="text-[#f85149]">-{totalDel.toLocaleString()}</span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-[#a8a8a8] hover:bg-[#252525]"
        >
          {t("reviewCompare")} <ChevronDown size={12} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col border-r border-codex-border">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#262626] text-[12.5px]">
            <FileCode2 size={14} className="text-codex-muted shrink-0" />
            <span className="truncate text-[#e0e0e0] font-medium">{active?.path ?? "—"}</span>
            {active && (
              <span className="ml-auto font-mono text-[11.5px] shrink-0">
                <span className="text-[#3fb950]">+{active.add}</span>{" "}
                <span className="text-[#f85149]">-{active.del}</span>
              </span>
            )}
          </div>
          <pre className="flex-1 overflow-auto px-0 py-2 text-[12px] font-mono leading-relaxed">
            {MOCK_DIFF.split("\n").map((line, i) => (
              <div key={i} className={`px-3 whitespace-pre ${colorDiffLine(line)}`}>
                {line || " "}
              </div>
            ))}
          </pre>
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
                  <span className="text-[#3fb950]">+{f.add}</span>{" "}
                  <span className="text-[#f85149]">-{f.del}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface FileEntry {
  path: string;
  kind: "file" | "dir";
  icon?: string;
  ext?: string;
}

function FilesPane() {
  const { t } = useTranslation("tools");
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { data, loading, error } = useApi<{ entries: FileEntry[]; path: string }>(
    currentPath ? `/files?path=${encodeURIComponent(currentPath)}` : "/files",
  );

  const entries = (data?.entries ?? []).filter((e) =>
    e.path.toLowerCase().includes(filter.toLowerCase()),
  );
  const crumbs = currentPath ? currentPath.split(/[/\\]/).filter(Boolean) : [];
  const previewLines = (selectedFile ? MOCK_FILE_PREVIEW : "").split("\n");

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 min-w-0 flex flex-col border-r border-codex-border">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#262626]">
          <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap text-[12.5px] text-[#8a8a8a]">
            <button
              type="button"
              onClick={() => {
                setCurrentPath("");
                setSelectedFile(null);
              }}
              className="hover:text-[#e0e0e0] px-1 rounded hover:bg-[#262626]"
            >
              root
            </button>
            {crumbs.map((c, i) => {
              const path = crumbs.slice(0, i + 1).join("/");
              const isLast = i === crumbs.length - 1 && !selectedFile;
              return (
                <span key={path} className="inline-flex items-center gap-1">
                  <span className="text-[#555]">›</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPath(path);
                      setSelectedFile(null);
                    }}
                    className={`px-1 rounded hover:bg-[#262626] ${isLast ? "text-[#e0e0e0] font-medium" : "hover:text-[#e0e0e0]"}`}
                  >
                    {c}
                  </button>
                </span>
              );
            })}
            {selectedFile && (
              <span className="inline-flex items-center gap-1">
                <span className="text-[#555]">›</span>
                <span className="text-[#e0e0e0] font-medium truncate max-w-[120px]">
                  {selectedFile.split(/[/\\]/).pop()}
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            className="w-7 h-7 inline-flex items-center justify-center text-[#888] hover:bg-[#2a2a2a] rounded"
            title={t("filesCopy")}
            aria-label={t("filesCopy")}
            onClick={() => {
              if (selectedFile) void navigator.clipboard?.writeText(MOCK_FILE_PREVIEW);
            }}
          >
            <Copy size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto min-h-0 font-mono text-[12.5px] leading-[1.6] bg-[#121212]">
          {!selectedFile ? (
            <div className="h-full flex items-center justify-center text-codex-muted text-sm px-4 text-center">
              {t("emptyFiles")}
            </div>
          ) : (
            previewLines.map((line, i) => (
              <div key={i} className="flex min-w-max">
                <span className="w-11 shrink-0 text-right pr-3 pl-2 text-[#555] select-none">{i + 1}</span>
                <span className="pr-5 text-[#d4d4d4] whitespace-pre">{line || " "}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <aside className="w-[min(210px,40%)] flex flex-col min-h-0 bg-[#1a1a1a]">
        <div className="m-2.5 mb-2 flex items-center gap-2 px-2.5 py-1.5 bg-[#222] border border-[#2e2e2e] rounded-lg">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filesFilter")}
            className="w-full bg-transparent outline-none text-[12px]"
            aria-label={t("filesFilter")}
          />
        </div>
        <div className="flex-1 overflow-auto px-1.5 pb-2">
          {loading && <p className="px-2 py-3 text-[12px] text-codex-muted">{t("loading")}</p>}
          {error && <p className="px-2 py-3 text-[12px] text-codex-danger">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="px-2 py-3 text-[12px] text-codex-muted">{t("filesEmptyDir")}</p>
          )}
          {entries.map((f) =>
            f.kind === "dir" ? (
              <button
                key={f.path}
                type="button"
                onClick={() => {
                  setCurrentPath(f.path);
                  setSelectedFile(null);
                }}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12.5px] text-[#c4c4c4] hover:bg-[#252525] text-left"
              >
                <Folder size={13} className="shrink-0 opacity-80" />
                <span className="truncate">{f.path.split(/[/\\]/).pop() || f.path}</span>
              </button>
            ) : (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelectedFile(f.path)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12.5px] text-left ${
                  selectedFile === f.path
                    ? "bg-[#2e2e2e] text-[#f0f0f0]"
                    : "text-[#c4c4c4] hover:bg-[#252525]"
                }`}
              >
                <FileCode2 size={13} className="shrink-0 opacity-80" />
                <span className="truncate">{f.path.split(/[/\\]/).pop() || f.path}</span>
              </button>
            ),
          )}
        </div>
      </aside>
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

export function ToolsPanel() {
  const { t } = useTranslation("tools");
  const toolsOpen = useShellStore((s) => s.toolsOpen);
  const layoutMode = useShellStore((s) => s.layoutMode);
  const activeToolPane = useShellStore((s) => s.activeToolPane);
  const sessionTabs = useShellStore((s) => s.sessionTabs);
  const activeTabId = useShellStore((s) => s.activeTabId);
  const activateTab = useShellStore((s) => s.activateTab);
  const closeTab = useShellStore((s) => s.closeTab);
  const closeTools = useShellStore((s) => s.closeTools);
  const showHub = useShellStore((s) => s.showHub);
  const openTerm = useShellStore((s) => s.openTerm);

  const width = layoutMode === "full" ? "min(720px,72vw)" : "min(420px,46vw)";

  return (
    <aside
      className={`shrink-0 overflow-hidden bg-codex-bg flex flex-col min-h-0 border-l border-codex-border transition-[width,opacity] duration-200 ${
        toolsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none border-l-0"
      }`}
      style={{ width: toolsOpen ? width : 0 }}
      aria-hidden={!toolsOpen}
    >
      <div className="h-full flex flex-col min-h-0 min-w-0" style={{ width }}>
        <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-codex-border bg-codex-panel min-h-9 overflow-x-auto">
          <button
            type="button"
            onClick={showHub}
            className={`px-2.5 py-1 rounded-lg text-[12.5px] ${
              activeToolPane === "hub" ? "bg-[#2e2e2e] text-[#f0f0f0]" : "text-[#9a9a9a] hover:bg-[#252525]"
            }`}
          >
            {t("hubTitle")}
          </button>
          {sessionTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => activateTab(tab.id)}
              className={`inline-flex items-center gap-1.5 max-w-[200px] px-2.5 py-1 rounded-lg text-[12.5px] ${
                activeTabId === tab.id
                  ? "bg-[#2e2e2e] text-[#f0f0f0]"
                  : "text-[#9a9a9a] hover:bg-[#252525]"
              }`}
            >
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
                className="opacity-60 hover:opacity-100"
                aria-label={t("close")}
              >
                <X size={12} />
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={closeTools}
            className="ml-auto text-codex-muted hover:text-codex-text p-1"
            aria-label={t("close")}
          >
            <X size={14} />
          </button>
        </div>

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
