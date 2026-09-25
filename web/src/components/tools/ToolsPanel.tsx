import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCode2,
  FolderTree,
  Globe,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { useShellStore, type ToolPane, type SessionTab } from "../../stores/shell";
import { useChatStore } from "../../stores/chat";
import { useSidechatStore } from "../../stores/sidechat";
import { useProvidersStore } from "../../stores/providers";
import { useIsAdmin } from "../../stores/capabilities";
import { toast } from "../../stores/toast";
import { apiFetch } from "../../lib/api";
import { useApi } from "../../hooks/use-api";
import { Markdown } from "../../components/home/markdown";
import { ChatThread } from "../../components/home/ChatThread";
import { ComposerAddMenu } from "../ComposerAddMenu";
import { SLASH_COMMANDS } from "../../mock/seeds";

const TAB_ICONS: Record<SessionTab["type"], typeof Terminal> = {
  review: FileCode2,
  terminal: Terminal,
  browser: Globe,
  files: FolderTree,
  sidechat: MessageSquare,
};

/** A skill from `GET /skills`; only enabled ones are offered in the slash menu. */
interface SkillItem {
  name: string;
  description: string;
  enabled: boolean;
}

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
            className="flex items-center gap-3 px-3.5 py-3 bg-codex-elevated border border-codex-border rounded-[10px] text-codex-text-secondary hover:bg-codex-active hover:border-codex-border-strong text-left"
          >
            <Icon size={18} className="shrink-0 opacity-90" />
            <span className="flex-1 text-[13.5px] font-medium">{label}</span>
            <kbd className="text-[11.5px] text-codex-muted bg-codex-surface border border-codex-border rounded-md px-2 py-0.5 font-mono">
              {kbd}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
}

function colorDiffLine(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-[#2f7d3d]";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-[#c0392b]";
  if (line.startsWith("@@")) return "text-[#2c5aa0]";
  return "text-codex-text-secondary";
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
          {t("reviewBranch")} <span className="text-codex-text font-medium">{data?.branch ?? "—"}</span>
        </span>
        <span className="text-[12px] text-codex-muted">
          {t("reviewBase")} <span className="text-codex-text font-medium">{data?.base ?? "—"}</span>
        </span>
        <span className="ml-auto text-[12px] font-mono">
          <span className="text-[#3fb950]">+{totalAdd.toLocaleString()}</span>{" "}
          <span className="text-[#f85149]">-{totalDel.toLocaleString()}</span>
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-codex-text-secondary hover:bg-codex-active"
          aria-label={t("reviewRefresh")}
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col border-r border-codex-border">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-codex-border text-[12.5px]">
            <FileCode2 size={14} className="text-codex-muted shrink-0" />
            <span className="truncate text-codex-text font-medium">{active?.path ?? "—"}</span>
            {active && (
              <span className="ml-auto font-mono text-[11.5px] shrink-0">
                <span className="text-[#3fb950]">+{active.additions}</span>{" "}
                <span className="text-[#f85149]">-{active.deletions}</span>
              </span>
            )}
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-codex-muted text-[13px]">
              {t("reviewLoading")}
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center text-codex-muted text-[13px]">
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
        <aside className="w-[min(200px,38%)] flex flex-col min-h-0">
          <div className="m-2.5 mb-2 flex items-center gap-2 px-2.5 py-1.5 bg-codex-elevated border border-codex-border rounded-lg">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("reviewFilter")}
              className="w-full bg-transparent outline-none text-[12px] text-codex-text"
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
                  activePath === f.path ? "bg-codex-active text-codex-text" : "text-codex-text-secondary hover:bg-codex-hover"
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
    } catch (e: unknown) {
      // 后端不支持/打开失败时不能静默失败：提示错误并提供「复制路径」兜底。
      const detail = e instanceof Error ? e.message : String(e);
      toast.error(`${t("filesOpenFailed")}：${detail}`);
      const abs = resolvedPath || `${filePath.repoPath}/${filePath.filePath}`;
      void navigator.clipboard?.writeText(abs);
      toast.info(t("filesOpenCopyPath", { path: abs }));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Breadcrumb bar: project / file + more (⋯) menu + open external */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-codex-border bg-codex-panel">
        <span className="text-[12.5px] text-codex-muted">{t("filesProject")}</span>
        <span className="text-codex-muted" aria-hidden>›</span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-codex-text font-medium min-w-0">
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
            className="w-7 h-7 inline-flex items-center justify-center rounded text-codex-muted hover:bg-codex-active hover:text-codex-text"
          >
            <span className="flex items-center gap-0.5">
              <span className="w-1 h-1 rounded-full bg-current" />
              <span className="w-1 h-1 rounded-full bg-current" />
              <span className="w-1 h-1 rounded-full bg-current" />
            </span>
          </button>
          {moreOpen && (
            <div
              className="fixed z-[120] w-[180px] p-1 bg-codex-elevated border border-codex-border-strong rounded-lg shadow-[0_10px_28px_rgba(0,0,0,.5)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2.5 py-1.5 text-[11px] text-codex-muted">
                {t(isMd ? "filesCategoryMd" : "filesCategorySource")}
              </div>
              <button
                type="button"
                onClick={() => { setView("preview"); setMoreOpen(false); }}
                className={`block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] ${view === "preview" ? "bg-codex-active text-codex-text" : "text-codex-text hover:bg-codex-active"}`}
              >
                {t("filesPreview")}
              </button>
              <button
                type="button"
                onClick={() => { setView("source"); setMoreOpen(false); }}
                className={`block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] ${view === "source" ? "bg-codex-active text-codex-text" : "text-codex-text hover:bg-codex-active"}`}
              >
                {t("filesSource")}
              </button>
              <div className="h-px bg-codex-active my-1" />
              <button
                type="button"
                onClick={handleCopyAbs}
                className="block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] text-codex-text hover:bg-codex-active"
              >
                {t("filesCopyAbs")}
              </button>
              <button
                type="button"
                onClick={handleCopyRel}
                className="block w-full px-2.5 py-1.5 rounded-md text-left text-[12.5px] text-codex-text hover:bg-codex-active"
              >
                {t("filesCopyRel")}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="w-7 h-7 inline-flex items-center justify-center rounded text-codex-muted hover:bg-codex-active hover:text-codex-text"
          title={t("filesOpen")}
          aria-label={t("filesOpen")}
          onClick={handleOpenExt}
        >
          <ExternalLink size={14} />
        </button>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-codex-muted text-[13px]">
          {t("emptyFiles")}…
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-codex-muted text-[13px]">
          {error}
        </div>
      ) : view === "preview" && isMd && fileContent ? (
        <div className="flex-1 overflow-auto min-h-0 px-5 py-5 text-[14px] leading-relaxed text-codex-text">
          <Markdown>{fileContent.content}</Markdown>
        </div>
      ) : view === "preview" && !isMd && fileContent ? (
        <div className="flex-1 overflow-auto min-h-0 px-4 py-3 text-[13.5px] leading-relaxed text-codex-text">
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
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);

  const navigate = () => {
    const raw = urlInput.trim();
    if (!raw) return;
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setPageUrl(normalized);
    setUrlInput(normalized);
  };

  // Drive the embedded page's history so back/forward/reload behave on the
  // actual document, not just the outer address box.
  const goBack = () => frameRef.current?.contentWindow?.history.back();
  const goForward = () => frameRef.current?.contentWindow?.history.forward();
  const reload = () => frameRef.current?.contentWindow?.location.reload();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-codex-border bg-codex-panel">
        <button
          type="button"
          onClick={goBack}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-codex-muted hover:bg-codex-active"
          aria-label={t("browserBack")}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={goForward}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-codex-muted hover:bg-codex-active"
          aria-label={t("browserForward")}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={reload}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-codex-muted hover:bg-codex-active"
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
            className="w-full bg-codex-elevated border border-codex-border rounded-lg px-3 py-1.5 text-[12.5px] outline-none focus:border-codex-border-strong"
            aria-label={t("browserUrlPlaceholder")}
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </div>
      <div className="flex-1 overflow-auto flex">
        {!pageUrl ? (
          <div className="m-auto text-center max-w-[320px] px-6 py-8">
            <Globe size={40} className="mx-auto mb-3 text-codex-muted opacity-80" />
            <p className="text-[18px] font-semibold text-codex-text mb-2">{t("browserEmptyTitle")}</p>
            <p className="text-[12.5px] text-codex-muted leading-relaxed">{t("browserEmptySub")}</p>
          </div>
        ) : (
          <iframe
            ref={frameRef}
            src={pageUrl}
            title={t("browserPageTitle")}
            className="flex-1 w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}

function SidechatPane() {
  const { t } = useTranslation("tools");
  const { t: tc } = useTranslation("composer");
  const messages = useSidechatStore((s) => s.messages);
  const typing = useSidechatStore((s) => s.typing);
  const activeTool = useSidechatStore((s) => s.activeTool);
  const historyError = useSidechatStore((s) => s.historyError);
  const stopStream = useSidechatStore((s) => s.stopStream);
  const chatting = useSidechatStore((s) => s.chatting);
  const loadingHistory = useSidechatStore((s) => s.loadingHistory);
  const sessionId = useSidechatStore((s) => s.sessionId);
  const streamStopped = useSidechatStore((s) => s.streamStopped);
  const pendingApprovals = useSidechatStore((s) => s.pendingApprovals);
  const pendingClarify = useSidechatStore((s) => s.pendingClarify);
  const decideApproval = useSidechatStore((s) => s.decideApproval);
  const answerClarify = useSidechatStore((s) => s.answerClarify);
  const loadHistory = useSidechatStore((s) => s.loadHistory);
  const wsReloadHistory = useSidechatStore((s) => s._wsReloadHistory);
  const setDraft = useSidechatStore((s) => s.setDraft);
  const draft = useSidechatStore((s) => s.draft);
  const addFile = useSidechatStore((s) => s.addFile);
  const [menu, setMenu] = useState<"perm" | "model" | "add" | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Enabled skills offered in the slash menu, same as the main composer.
  const { data: skillsData } = useApi<{ skills: SkillItem[] }>("/skills");
  const skills = useMemo(() => (skillsData?.skills ?? []).filter((s) => s.enabled), [skillsData]);
  const slashMatches = useMemo(() => {
    const prefix = draft.slice(1);
    const commands = SLASH_COMMANDS.filter((c) => c.label.startsWith(prefix));
    const skillItems = skills
      .filter((s) => s.name.startsWith(prefix))
      .map((s) => ({ id: `skill:${s.name}`, label: s.name, hint: s.description }));
    return { commands, skillItems };
  }, [draft, skills]);

  const model = useChatStore((s) => s.model);
  const reasoning = useChatStore((s) => s.reasoning);
  const perm = useChatStore((s) => s.perm);
  const setModel = useChatStore((s) => s.setModel);
  const setReasoning = useChatStore((s) => s.setReasoning);
  const setPerm = useChatStore((s) => s.setPerm);
  const persistPerm = useChatStore((s) => s.persistPerm);
  const isAdmin = useIsAdmin();
  const providers = useProvidersStore((s) => s.providers);
  const fetchProviders = useProvidersStore((s) => s.fetchProviders);

  useEffect(() => {
    void fetchProviders()
      .then(() => setProvidersLoaded(true))
      .catch(() => setProvidersLoaded(true));
  }, [fetchProviders]);

  // Close any open popover on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const availableModels = useMemo(() => {
    const set = new Set<string>();
    providers.forEach((p) => p.models?.forEach((m) => set.add(m)));
    return set.size > 0 ? Array.from(set).sort() : null;
  }, [providers]);

  const effortLabels = [tc("reasoningLow"), tc("reasoningMed"), tc("reasoningHigh"), tc("reasoningMax")];
  const effortLabel = effortLabels[reasoning] ?? effortLabels[0];
  const modelLabel = model || tc("noModel");
  const permLabel =
    perm === "ask" ? tc("permAskShort") : perm === "agent" ? tc("permAgentShort") : tc("permFullShort");

  const permOptions = [
    ["ask", "permAsk", "permAskDesc"],
    ["agent", "permAgent", "permAgentDesc"],
    ["full", "permFullLong", "permFullDesc"],
  ] as const;

  const send = () => {
    const text = draft.trim();
    if (!text || typing) return;
    useSidechatStore.getState().sendMessage();
  };

  const sideSelectors = {
    messages,
    loadingHistory,
    historyError,
    typing,
    activeTool,
    sessionId,
    streamStopped,
    pendingApprovals,
    pendingClarify,
    decideApproval,
    answerClarify,
    loadSessionHistory: loadHistory,
    wsReloadHistory,
  };

  return (
    <div ref={rootRef} className="flex-1 flex flex-col min-h-0 bg-codex-bg">
      {chatting ? (
        <ChatThread selectors={sideSelectors} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 min-h-0 overflow-auto select-none">
          <MessageSquarePlus size={28} className="mb-3 text-codex-muted opacity-70" aria-hidden />
          <p className="text-[15px] font-medium text-codex-text mb-1.5">{t("emptySidechat")}</p>
          <p className="text-[12.5px] text-codex-muted text-center leading-relaxed max-w-[260px]">{t("sidechatSub")}</p>
        </div>
      )}

      {historyError && (
        <div className="mx-3.5 mt-2 px-3 py-2 rounded-lg bg-codex-danger/10 text-codex-danger text-[12.5px] border border-codex-danger/20">
          {t("sidechatError", { error: historyError })}
        </div>
      )}

      <div className="shrink-0 mx-3.5 mb-3.5 bg-codex-surface border border-codex-border rounded-[14px] flex flex-col transition-colors duration-150 focus-within:border-codex-border-strong">
        <div className="relative">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => {
            const val = e.target.value;
            const caret = typeof e.target.selectionStart === "number" ? e.target.selectionStart : val.length;
            const justAt =
              caret > 0 && val.charAt(caret - 1) === "@" &&
              (caret === 1 || /\s/.test(val.charAt(caret - 2)));
            if (justAt) setMenu("add");
            setDraft(val);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !typing) {
              e.preventDefault();
              send();
            }
          }}
          disabled={typing}
          placeholder={t("sidechatPlaceholder")}
          rows={2}
          className="w-full resize-none bg-transparent border-0 px-3.5 pt-3 pb-1 text-[13px] text-codex-text placeholder:text-codex-muted outline-none leading-relaxed"
        />
        {/* / slash-command menu */}
        {draft.startsWith("/") && !draft.includes(" ") && (
          <div className="absolute left-3 bottom-[calc(100%-6px)] w-[min(520px,calc(100vw-24px))] max-h-[min(420px,55vh)] overflow-auto p-2 pl-2.5 bg-codex-elevated border border-codex-border-strong rounded-[14px] shadow-[0_16px_40px_rgba(0,0,0,.55)] z-30">
            {slashMatches.commands.length > 0 && (
              <>
                <div className="px-2.5 py-1.5 text-[12px] text-[#7dd3fc] font-medium">{tc("slashCommands")}</div>
                {slashMatches.commands.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setDraft(`/${c.label} `);
                      taRef.current?.focus();
                    }}
                    className="w-full flex items-baseline gap-3 px-2.5 py-2 rounded-[10px] text-left hover:bg-codex-active"
                  >
                    <span className="text-[13px] text-codex-text font-medium whitespace-nowrap">/{c.label}</span>
                    <span className="flex-1 min-w-0 text-[12px] text-codex-muted truncate">{c.hint}</span>
                  </button>
                ))}
              </>
            )}
            {slashMatches.skillItems.length > 0 && (
              <>
                <div className="px-2.5 py-1.5 text-[12px] text-[#7dd3fc] font-medium">{tc("skillsSection")}</div>
                {slashMatches.skillItems.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setDraft(`/${c.label} `);
                      taRef.current?.focus();
                    }}
                    className="w-full flex items-baseline gap-3 px-2.5 py-2 rounded-[10px] text-left hover:bg-codex-active"
                  >
                    <span className="text-[13px] text-codex-text font-medium whitespace-nowrap">/{c.label}</span>
                    <span className="flex-1 min-w-0 text-[12px] text-codex-muted truncate">{c.hint}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        </div>
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 relative">
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => setMenu((cur) => (cur === "add" ? null : "add"))}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-codex-muted hover:bg-codex-active"
            aria-label={t("sidechatAdd")}
            title={t("sidechatAdd")}
            aria-haspopup="menu"
            aria-expanded={menu === "add"}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => setMenu((cur) => (cur === "perm" ? null : "perm"))}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12.5px] ${
              perm === "full" ? "text-codex-warn" : "text-codex-muted"
            } hover:bg-codex-active`}
            aria-label={permLabel}
            aria-haspopup="menu"
            aria-expanded={menu === "perm"}
          >
            <ShieldAlert size={14} />
            <span>{permLabel}</span>
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setMenu((cur) => (cur === "model" ? null : "model"))}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-codex-muted px-2 py-1 rounded-md hover:bg-codex-active hover:text-codex-text-secondary"
            aria-label={tc("model")}
            aria-haspopup="menu"
            aria-expanded={menu === "model"}
          >
            <span>{modelLabel}</span>
            <span className="text-[11px] text-codex-muted bg-codex-active px-1.5 py-0.5 rounded">{effortLabel}</span>
          </button>
          <button
            type="button"
            disabled={!draft.trim() && !typing}
            onClick={() => (typing ? stopStream() : send())}
            aria-label={typing ? tc("stop") : tc("send")}
            title={typing ? tc("stop") : tc("send")}
            className={`w-8 h-8 rounded-full inline-flex items-center justify-center ${
              !draft.trim() && !typing
                ? "bg-codex-border text-codex-muted"
                : typing
                  ? "bg-codex-active text-codex-text hover:bg-codex-hover"
                  : "bg-codex-accent text-white hover:bg-codex-accent-hover"
            }`}
          >
            {typing ? <Square size={14} /> : <ArrowUp size={16} />}
          </button>

          {menu === "perm" && (
            <div className="absolute left-2 bottom-[calc(100%+4px)] w-[320px] p-2 bg-codex-surface border border-codex-border-strong rounded-[10px] shadow-xl z-30">
              <div className="text-[12px] text-codex-muted px-2 py-1 mb-1">{tc("permTitle")}</div>
              {permOptions.map(([id, labelKey, descKey]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (isAdmin) {
                      persistPerm(id).catch(() => toast.error(tc("permSaveFailed")));
                    } else {
                      setPerm(id);
                    }
                    setMenu(null);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md ${
                    perm === id ? "bg-codex-active" : "hover:bg-codex-active"
                  }`}
                >
                  <div className={`text-[13px] font-medium ${id === "full" ? "text-codex-warn" : "text-codex-text"}`}>
                    {tc(labelKey)}
                  </div>
                  <div className="text-[11.5px] text-codex-muted mt-0.5">{tc(descKey)}</div>
                </button>
              ))}
            </div>
          )}

          {menu === "model" && (
            <div className="absolute right-10 bottom-[calc(100%+4px)] w-[300px] p-2 bg-codex-surface border border-codex-border-strong rounded-[10px] shadow-xl z-30">
              <div className="flex items-start justify-between gap-2 px-2 py-1">
                <div>
                  <div className="text-[12px] text-codex-muted">{effortLabel}</div>
                  <div className="text-[13px] text-codex-text font-medium">{modelLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setReasoning(3)}
                  className="p-1 rounded-md text-codex-muted hover:bg-codex-active hover:text-codex-text"
                  aria-label={tc("resetReasoning")}
                  title={tc("resetReasoning")}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className="px-2 py-2">
                <div className="model-menu-slider">
                  <div className="model-menu-track">
                    <div className="model-menu-fill" style={{ width: `${(reasoning / 3) * 100}%` }} />
                    <div className="model-menu-dots" aria-hidden="true">
                      <span /><span /><span /><span />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={1}
                      value={reasoning}
                      onChange={(e) => setReasoning(Number(e.target.value))}
                      aria-label={effortLabel}
                      className="model-menu-range"
                    />
                  </div>
                </div>
              </div>
              <input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder={tc("searchModel")}
                className="w-full bg-codex-surface border border-codex-border rounded-md px-2 py-1.5 text-[12.5px] mb-1 outline-none"
              />
              <div className="max-h-40 overflow-auto">
                {providersLoaded && !availableModels ? (
                  <div className="px-2 py-1.5 text-[12.5px] text-codex-muted">{tc("loadingModels")}</div>
                ) : availableModels !== null ? (
                  availableModels
                    .filter((m) => m.toLowerCase().includes(modelQuery.toLowerCase()))
                    .map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          void setModel(m);
                          setMenu(null);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-[13px] ${
                          model === m ? "bg-codex-active" : "hover:bg-codex-active"
                        }`}
                      >
                        {m}
                      </button>
                    ))
                ) : null}
              </div>
            </div>
          )}

          {menu === "add" && (
            <ComposerAddMenu
              open
              anchorEl={addBtnRef.current}
              onClose={() => setMenu(null)}
              onOpenProject={() => setMenu(null)}
              onGoal={() => setMenu(null)}
              onPlan={() => setMenu(null)}
              onAddFile={addFile}
              showWorkflow={false}
            />
          )}
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
      className="fixed z-[130] w-[min(320px,calc(100vw-24px))] max-h-[min(420px,70vh)] flex flex-col bg-codex-elevated border border-codex-border-strong rounded-xl shadow-[0_14px_36px_rgba(0,0,0,.55)] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-codex-border text-[12px] text-codex-muted">
        {t("picker")}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-1.5">
        {sessionTabs.length === 0 && (
          <div className="px-3 py-4 text-center text-[12.5px] text-codex-muted">{t("emptyTabs")}</div>
        )}
        {sessionTabs.map((tab) => {
          const Icon = TAB_ICONS[tab.type];
          return (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] ${
                activeTabId === tab.id ? "bg-codex-active text-codex-text" : "text-codex-text-secondary hover:bg-codex-active"
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
                className="w-5 h-5 inline-flex items-center justify-center rounded text-codex-muted hover:bg-codex-active hover:text-codex-text shrink-0"
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
  const [hubMenuPos, setHubMenuPos] = useState({ top: 0, left: 0 });
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
                className="w-6 h-6 m-1.5 inline-flex items-center justify-center rounded text-codex-muted hover:bg-codex-active hover:text-codex-text"
              >
                <ChevronDown size={14} />
              </button>
              {pickerOpen && <TabPicker onClose={() => setPickerOpen(false)} />}
            </div>
          )}
          <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-x-hidden mr-[100px]">
            {sessionTabs.length === 0 && (
              <button
                type="button"
                onClick={showHub}
                className="px-2.5 py-1.5 text-[12.5px] text-codex-muted hover:text-codex-text-secondary shrink-0"
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
                      ? "bg-codex-active text-codex-text border-t-codex-accent"
                      : "border-t-transparent text-codex-muted hover:bg-codex-hover hover:text-codex-text-secondary"
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
            {/* 新建工具：吸附在 tab 列表右侧，与 tabs 连成一体 */}
            <button
              type="button"
              onClick={(e) => {
                setHubMenuPos({ top: e.clientY, left: e.clientX });
                setHubMenuOpen((v) => !v);
              }}
              aria-expanded={hubMenuOpen}
              title={t("newTool")}
              aria-label={t("newTool")}
              className="w-7 h-7 m-1.5 inline-flex items-center justify-center rounded text-codex-muted hover:bg-codex-active hover:text-codex-text shrink-0"
            >
              <Plus size={14} />
            </button>
          </div>
          </div>
          {/* Reserved room for the floating layout toolbar (全屏 / 底部 / 侧栏) */}
          <div className="w-[110px] min-w-[110px] shrink-0 pointer-events-none" aria-hidden />
          {hubMenuOpen && (
            <div
              className="fixed z-[120] min-w-[168px] p-1 bg-codex-elevated border border-codex-border-strong rounded-lg shadow-[0_10px_28px_rgba(0,0,0,.5)]"
              style={{ top: hubMenuPos.top, left: hubMenuPos.left }}
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
                    className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-codex-text hover:bg-codex-active"
                  >
                    {t(type)}
                  </button>
                );
              })}
            </div>
          )}

          {menuTabId && sessionTabs.length > 0 && (
            <div
              className="fixed z-[120] min-w-[168px] p-1 bg-codex-elevated border border-codex-border-strong rounded-lg shadow-[0_10px_28px_rgba(0,0,0,.5)]"
              style={menuPos}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  closeOtherTabs(menuTabId);
                  setMenuTabId(null);
                }}
                className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-codex-text hover:bg-codex-active"
              >
                {t("closeOthers")}
              </button>
              <button
                type="button"
                onClick={() => {
                  closeRightTabs(menuTabId);
                  setMenuTabId(null);
                }}
                className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-codex-text hover:bg-codex-active"
              >
                {t("closeRight")}
              </button>
              <button
                type="button"
                onClick={() => {
                  closeTab(menuTabId);
                  setMenuTabId(null);
                }}
                className="block w-full px-3 py-2 rounded-md text-left text-[13px] text-codex-text hover:bg-codex-active"
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
