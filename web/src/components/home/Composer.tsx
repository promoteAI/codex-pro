import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Folder,
  GitBranch,
  Plus,
  ShieldAlert,
  ArrowUp,
  Loader2,
  RotateCcw,
  Target,
  Lightbulb,
  X,
} from "lucide-react";
import { useChatStore } from "../../stores/chat";
import { ProjectMenu } from "../ProjectMenu";
import { CreateProjectDialog } from "../CreateProjectDialog";
import { BranchMenu } from "../BranchMenu";
import { ComposerAddMenu } from "../ComposerAddMenu";
import {
  MOCK_CTX_USAGE,
  MOCK_MODELS,
  SLASH_COMMANDS,
} from "../../mock/seeds";

type Menu = "project" | "branch" | "model" | "perm" | "add" | "ctx" | null;

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function Composer() {
  const { t } = useTranslation("composer");
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const typing = useChatStore((s) => s.typing);
  const project = useChatStore((s) => s.project);
  const isGit = useChatStore((s) => s.isGit);
  const branch = useChatStore((s) => s.branch);
  const model = useChatStore((s) => s.model);
  const effort = useChatStore((s) => s.effort);
  const perm = useChatStore((s) => s.perm);
  const planMode = useChatStore((s) => s.planMode);
  const goalMode = useChatStore((s) => s.goalMode);
  const selectProject = useChatStore((s) => s.selectProject);
  const setBranch = useChatStore((s) => s.setBranch);
  const setModel = useChatStore((s) => s.setModel);
  const setEffort = useChatStore((s) => s.setEffort);
  const setPerm = useChatStore((s) => s.setPerm);
  const setPlanMode = useChatStore((s) => s.setPlanMode);
  const setGoalMode = useChatStore((s) => s.setGoalMode);
  const repos = useChatStore((s) => s.repos);
  const branches = useChatStore((s) => s.branches);
  const loadRepos = useChatStore((s) => s.loadRepos);
  const loadBranches = useChatStore((s) => s.loadBranches);
  const loadingBranches = useChatStore((s) => s.loadingBranches);
  const chatting = useChatStore((s) => s.chatting);

  const [menu, setMenu] = useState<Menu>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const projectBtnRef = useRef<HTMLButtonElement>(null);
  const branchBtnRef = useRef<HTMLButtonElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const ctxUsage = useMemo(() => {
    const used = MOCK_CTX_USAGE.segments.reduce((s, x) => s + x.tokens, 0);
    const pct = Math.round((used / MOCK_CTX_USAGE.max) * 100);
    return { used, pct };
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    const repo = repos.find((r) => r.name === project);
    if (repo) {
      void loadBranches(repo.path);
    }
  }, [project, repos, loadBranches]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((target as Element).closest?.("#projectMenu,#branchMenu,#addMenu")) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const permLabel =
    perm === "ask" ? t("permAsk") : perm === "agent" ? t("permAgent") : t("permFull");
  const effortLabels = [t("effortLow"), t("effortMed"), t("effortHigh"), t("effortMax")];
  const effortLabel = effortLabels[effort] ?? effortLabels[0];
  const modelLabel =
    model === "agnes-2.5-flash" || model === "自定义" ? t("modelCustom") : model;
  const canSend = draft.trim().length > 0 && !typing;
  const showGoalBtn = goalMode || planMode;
  const showCtxUsage = chatting;

  const toggle = (m: Menu) => setMenu((cur) => (cur === m ? null : m));

  const permOptions = [
    ["ask", "permAsk", "permAskDesc"],
    ["agent", "permAgent", "permAgentDesc"],
    ["full", "permFullLong", "permFullDesc"],
  ] as const;

  return (
    <div ref={rootRef} className="shrink-0 px-[clamp(16px,4vw,32px)] pb-[clamp(14px,2vw,22px)]">
      <div className="max-w-[720px] mx-auto bg-codex-surface border border-codex-border rounded-[14px] relative">
        {/* ctx-bar: separate top row (project / branch), hidden while chatting */}
        <div className={`flex flex-wrap items-center gap-1 px-3 pt-2.5 pb-1 border-b border-[#262626] ${chatting ? "hidden" : ""}`}>
          <button
            ref={projectBtnRef}
            type="button"
            onClick={() => toggle("project")}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c0c0c0] px-2 py-1 rounded-md hover:bg-[#2a2a2a]"
            aria-label={t("project")}
            aria-haspopup="menu"
            aria-expanded={menu === "project"}
            aria-controls="projectMenu"
          >
            <Folder size={14} />
            <span>{project || t("noProjectLabel")}</span>
            <svg className="w-2.5 h-2.5 opacity-65" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {isGit && (
            <button
              ref={branchBtnRef}
              type="button"
              onClick={() => toggle("branch")}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c0c0c0] px-2 py-1 rounded-md hover:bg-[#2a2a2a]"
              aria-label={t("branch")}
              aria-haspopup="menu"
              aria-expanded={menu === "branch"}
              aria-controls="branchMenu"
            >
              <GitBranch size={14} />
              <span>{branch}</span>
              <svg className="w-2.5 h-2.5 opacity-65" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>

        <ProjectMenu
          open={menu === "project"}
          anchorEl={projectBtnRef.current}
          project={project}
          repos={repos}
          onSelect={selectProject}
          onCreate={() => setShowCreateProject(true)}
          onClose={() => setMenu(null)}
        />
        <CreateProjectDialog
          open={showCreateProject}
          onClose={() => setShowCreateProject(false)}
        />

        <BranchMenu
          open={menu === "branch"}
          anchorEl={branchBtnRef.current}
          project={project}
          branch={branch}
          branches={branches}
          loading={loadingBranches}
          onSelect={setBranch}
          onCreateBranch={useChatStore.getState().createBranch}
          onClose={() => setMenu(null)}
        />

        <div className="px-3 py-2 relative">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !typing) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={typing}
            placeholder={t("placeholder")}
            rows={2}
            className="w-full resize-none bg-transparent outline-none text-[13.5px] text-codex-text placeholder:text-codex-muted leading-relaxed"
          />
          {/* / slash-command menu */}
          {draft.startsWith("/") && !draft.includes(" ") && (
            <div className="absolute left-3 bottom-[calc(100%-6px)] w-[min(520px,calc(100vw-24px))] max-h-[min(420px,55vh)] overflow-auto p-2 pl-2.5 bg-[#1c1c1c] border border-[#333] rounded-[14px] shadow-[0_16px_40px_rgba(0,0,0,.55)] z-30">
              <div className="px-2.5 py-1.5 text-[12px] text-[#7dd3fc] font-medium">{t("slashCommands")}</div>
              {SLASH_COMMANDS.filter((c) => c.label.startsWith(draft.slice(1))).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (c.id === "plan") setPlanMode(true);
                    else if (c.id === "goal") setGoalMode(true);
                    setDraft(`/${c.label} `);
                    taRef.current?.focus();
                  }}
                  className="w-full flex items-baseline gap-3 px-2.5 py-2 rounded-[10px] text-left hover:bg-[#2e2e2e]"
                >
                  <span className="text-[13px] text-[#e8e8e8] font-medium whitespace-nowrap">/{c.label}</span>
                  <span className="flex-1 min-w-0 text-[12px] text-[#8a8a8a] truncate">{c.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 relative">
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => toggle("add")}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#aaa] hover:bg-[#2a2a2a]"
            aria-label={t("add")}
            title={t("add")}
            aria-haspopup="menu"
            aria-expanded={menu === "add"}
            aria-controls="addMenu"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => toggle("perm")}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12.5px] ${
              perm === "full" ? "text-codex-warn" : "text-[#c0c0c0]"
            } hover:bg-[#2a2a2a]`}
            aria-label={permLabel}
          >
            {perm === "full" ? (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                <path
                  d="M12 3 5.5 5.8v5.4c0 4.2 2.7 7.9 6.5 9.3 3.8-1.4 6.5-5.1 6.5-9.3V5.8L12 3Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path d="M12 8.2v4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <circle cx="12" cy="15.2" r=".7" fill="currentColor" />
              </svg>
            ) : (
              <ShieldAlert size={14} />
            )}
            <span>{permLabel}</span>
          </button>
          {showGoalBtn && (
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12.5px] hover:bg-[#2a2a2a] ${
                planMode ? "text-[#c8c8c8]" : "text-[#a0a0a0]"
              }`}
              aria-label={planMode ? t("planMode") : t("goal")}
              onClick={() => {
                if (planMode) setPlanMode(true);
                else setGoalMode(true);
              }}
            >
              {planMode ? <Lightbulb size={14} /> : <Target size={14} />}
              <span>{planMode ? t("planMode") : t("goal")}</span>
            </button>
          )}
          <span className="flex-1" />

          {/* Context usage — only while chatting (empty home matches Codex screenshot) */}
          {showCtxUsage && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => toggle("ctx")}
                aria-haspopup="dialog"
                aria-expanded={menu === "ctx"}
                className="h-[26px] px-2 inline-flex items-center gap-1.5 rounded-md text-[12.5px] text-[#9a9a9a] hover:bg-[#262626] hover:text-[#d8d8d8]"
                title="Context Usage"
                aria-label="Context Usage"
              >
                <span
                  className="w-[18px] h-[18px] rounded-full flex-none"
                  style={{
                    background: `conic-gradient(${MOCK_CTX_USAGE.segments
                      .map((s) => `${s.color} 0 ${s.direct}%`)
                      .join(",")}, #2a2a2a ${ctxUsage.pct}% 100%)`,
                    WebkitMask:
                      "radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px))",
                    mask: "radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2.5px))",
                  }}
                  aria-hidden
                />
                <span className="tabular-nums leading-none">{ctxUsage.pct}%</span>
              </button>
              {menu === "ctx" && (
                <div
                  className="absolute right-0 bottom-[calc(100%+6px)] w-[300px] p-3.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[14px] shadow-[0_16px_40px_rgba(0,0,0,.55)] z-30"
                  role="dialog"
                  aria-label="Context Usage"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[14px] font-medium text-[#e8e8e8]">{t("ctxTitle")}</span>
                    <button
                      type="button"
                      onClick={() => setMenu(null)}
                      className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#888] hover:bg-[#353535] hover:text-[#eee]"
                      aria-label={t("ctxClose")}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 mb-2.5">
                    <span className="text-[13.5px] text-[#e0e0e0] font-medium">
                      {t("ctxFull", { pct: ctxUsage.pct })}
                    </span>
                    <span className="text-[12.5px] text-[#9a9a9a] tabular-nums whitespace-nowrap">
                      ~{formatTokens(ctxUsage.used)} / {formatTokens(MOCK_CTX_USAGE.max)} Tokens
                    </span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-[#1e1e1e] mb-3.5">
                    {MOCK_CTX_USAGE.segments.map((s) => (
                      <span
                        key={s.key}
                        style={{ width: `${s.direct}%`, background: s.color }}
                        className="h-full min-w-[2px]"
                      />
                    ))}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {MOCK_CTX_USAGE.segments.map((s) => (
                      <div
                        key={s.key}
                        className="flex items-center gap-2.5 py-[7px] text-[13px] text-[#d8d8d8] leading-tight"
                      >
                        <span className="w-2.5 h-2.5 rounded-[2.5px] flex-none" style={{ background: s.color }} />
                        <span className="flex-1 min-w-0">{s.label}</span>
                        <span className="flex-none text-[#b0b0b0] tabular-nums">{formatTokens(s.tokens)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => toggle("model")}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#a0a0a0] px-2 py-1 rounded-md hover:bg-[#2a2a2a] hover:text-[#d8d8d8]"
            aria-label={t("model")}
          >
            <span>{modelLabel}</span>
            <span className="text-[11px] text-[#666] bg-[#252525] px-1.5 py-0.5 rounded">{effortLabel}</span>
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => sendMessage()}
            aria-label={t("send")}
            title={t("send")}
            className={`w-8 h-8 rounded-full inline-flex items-center justify-center ${
              canSend
                ? "bg-codex-accent text-white hover:bg-codex-accent-hover"
                : "bg-[#2a2a2a] text-[#666]"
            }`}
          >
            {typing ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>

          {menu === "perm" && (
            <div className="absolute left-2 bottom-[calc(100%+4px)] w-[320px] p-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl z-30">
              <div className="text-[12px] text-codex-muted px-2 py-1 mb-1">{t("permTitle")}</div>
              {permOptions.map(([id, labelKey, descKey]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPerm(id);
                    setMenu(null);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md ${
                    perm === id ? "bg-[#353535]" : "hover:bg-[#353535]"
                  }`}
                >
                  <div
                    className={`text-[13px] font-medium ${id === "full" ? "text-codex-warn" : "text-[#e0e0e0]"}`}
                  >
                    {t(labelKey)}
                  </div>
                  <div className="text-[11.5px] text-codex-muted mt-0.5">{t(descKey)}</div>
                </button>
              ))}
            </div>
          )}

          {menu === "model" && (
            <div className="absolute right-10 bottom-[calc(100%+4px)] w-[300px] p-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl z-30">
              <div className="flex items-start justify-between gap-2 px-2 py-1">
                <div>
                  <div className="text-[12px] text-codex-muted">{effortLabel}</div>
                  <div className="text-[13px] text-[#e0e0e0] font-medium">{modelLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEffort(3)}
                  className="p-1 rounded-md text-codex-muted hover:bg-[#353535] hover:text-[#e0e0e0]"
                  aria-label={t("resetEffort")}
                  title={t("resetEffort")}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <div className="px-2 py-2">
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={effort}
                  onChange={(e) => setEffort(Number(e.target.value))}
                  aria-label={effortLabel}
                  className="w-full"
                />
              </div>
              <input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder={t("searchModel")}
                className="w-full bg-[#1e1e1e] border border-[#333] rounded-md px-2 py-1.5 text-[12.5px] mb-1 outline-none"
              />
              <div className="max-h-40 overflow-auto">
                {MOCK_MODELS.filter((m) => m.toLowerCase().includes(modelQuery.toLowerCase())).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setModel(m);
                        setMenu(null);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded text-[13px] ${
                        model === m ? "bg-[#353535]" : "hover:bg-[#353535]"
                      }`}
                    >
                      {m}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          <ComposerAddMenu
            open={menu === "add"}
            anchorEl={addBtnRef.current}
            onClose={() => setMenu(null)}
            onOpenProject={() => setMenu("project")}
            onGoal={() => setGoalMode(true)}
            onPlan={() => setPlanMode(true)}
          />
        </div>
      </div>
    </div>
  );
}
