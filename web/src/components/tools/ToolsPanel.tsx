import { useTranslation } from "react-i18next";
import { FileCode2, Globe, FolderTree, MessageSquare, Terminal, X } from "lucide-react";
import { useShellStore, type ToolPane } from "../../stores/shell";
import { MOCK_DIFF, MOCK_FILES } from "../../mock/seeds";

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

function ReviewPane() {
  const { t } = useTranslation("tools");
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <h3 className="text-sm font-semibold text-[#e0e0e0] px-4 pt-3 pb-2">{t("review")}</h3>
      <pre className="flex-1 overflow-auto px-4 pb-4 text-[12px] font-mono text-[#c8c8c8] whitespace-pre-wrap">
        {MOCK_DIFF}
      </pre>
    </div>
  );
}

function FilesPane() {
  const { t } = useTranslation("tools");
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <h3 className="text-sm font-semibold text-[#e0e0e0] px-4 pt-3 pb-2">{t("files")}</h3>
      <ul className="flex-1 overflow-auto px-2">
        {MOCK_FILES.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 rounded-md text-[13px] text-[#c8c8c8] hover:bg-codex-hover truncate"
            >
              {f.kind === "dir" ? "📁 " : "📄 "}
              {f.path}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrowserPane() {
  const { t } = useTranslation("tools");
  return (
    <div className="flex-1 flex items-center justify-center text-codex-muted text-sm px-6 text-center">
      {t("emptyBrowser")}
    </div>
  );
}

function SidechatPane() {
  const { t } = useTranslation("tools");
  return (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      <div className="flex-1 flex items-center justify-center text-codex-muted text-sm">
        {t("emptySidechat")}
      </div>
      <input
        className="mt-2 bg-codex-surface border border-codex-border rounded-lg px-3 py-2 text-sm outline-none"
        placeholder="…"
      />
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
              {t("terminal")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
