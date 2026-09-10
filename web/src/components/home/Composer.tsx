import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Folder,
  Monitor,
  GitBranch,
  Plus,
  ShieldAlert,
  ArrowUp,
  Loader2,
  ExternalLink,
  RotateCcw,
  Target,
  Lightbulb,
  Paperclip,
} from "lucide-react";
import { useChatStore, type GitRepo, type GitBranch as GitBranchType } from "../../stores/chat";
import { toast } from "../../stores/toast";
import { MOCK_AGENT, MOCK_BROWSER_TABS, MOCK_MARKETPLACE, MOCK_MODELS } from "../../mock/seeds";

type Menu = "project" | "env" | "branch" | "model" | "perm" | "add" | null;

export function Composer() {
  const { t } = useTranslation("composer");
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const typing = useChatStore((s) => s.typing);
  const project = useChatStore((s) => s.project);
  const env = useChatStore((s) => s.env);
  const branch = useChatStore((s) => s.branch);
  const model = useChatStore((s) => s.model);
  const effort = useChatStore((s) => s.effort);
  const perm = useChatStore((s) => s.perm);
  const planMode = useChatStore((s) => s.planMode);
  const goalMode = useChatStore((s) => s.goalMode);
  const setProject = useChatStore((s) => s.setProject);
  const setEnv = useChatStore((s) => s.setEnv);
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

  const [menu, setMenu] = useState<Menu>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

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
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenu(null);
        setCreatingBranch(false);
      }
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

  const envLabel =
    env === "local"
      ? t("envLocal")
      : env === "worktree"
        ? t("envWorktree")
        : env === "codex-web"
          ? t("envWeb")
          : t("envCloud");
  const permLabel =
    perm === "ask" ? t("permAskShort") : perm === "agent" ? t("permAgentShort") : t("permFullShort");
  const effortLabels = [t("effortLow"), t("effortMed"), t("effortHigh"), t("effortMax")];
  const effortLabel = effortLabels[effort] ?? effortLabels[0];
  const canSend = draft.trim().length > 0 && !typing;
  const showGoalBtn = goalMode || planMode;

  const filteredRepos = useMemo(
    () => repos.filter((r) => r.name.toLowerCase().includes(projectQuery.toLowerCase())),
    [repos, projectQuery],
  );
  const filteredBranches = useMemo(
    () => branches.filter((b) => b.name.toLowerCase().includes(branchQuery.toLowerCase())),
    [branches, branchQuery],
  );

  const toggle = (m: Menu) =>
    setMenu((cur) => {
      if (cur === m) return null;
      setCreatingBranch(false);
      return m;
    });

  const menuBox =
    "absolute z-30 left-0 bottom-[calc(100%+6px)] min-w-[260px] max-h-80 overflow-auto p-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl";

  const envOptions = [
    ["local", "envLocal", false],
    ["worktree", "envWorktree", false],
    ["codex-web", "envWeb", true],
    ["cloud", "envCloud", false],
  ] as const;

  const permOptions = [
    ["ask", "permAsk", "permAskDesc"],
    ["agent", "permAgent", "permAgentDesc"],
    ["full", "permFullLong", "permFullDesc"],
  ] as const;

  const commitCreateBranch = () => {
    const name = newBranchName.trim();
    if (!name) return;
    setBranch(name);
    setNewBranchName("");
    setCreatingBranch(false);
    setMenu(null);
  };

  return (
    <div ref={rootRef} className="shrink-0 px-[clamp(16px,4vw,32px)] pb-[clamp(14px,2vw,22px)]">
      <div className="max-w-[720px] mx-auto bg-codex-surface border border-codex-border rounded-[14px] relative">
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2.5">
          <button
            type="button"
            onClick={() => toggle("project")}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c0c0c0] px-2 py-1 rounded-md hover:bg-[#2a2a2a]"
            aria-label={t("project")}
          >
            <Folder size={14} />
            <span>{project || t("noProjectLabel")}</span>
          </button>
          <button
            type="button"
            onClick={() => toggle("env")}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c0c0c0] px-2 py-1 rounded-md hover:bg-[#2a2a2a]"
            aria-label={t("env")}
          >
            <Monitor size={14} />
            <span>{envLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => toggle("branch")}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c0c0c0] px-2 py-1 rounded-md hover:bg-[#2a2a2a]"
            aria-label={t("branch")}
          >
            <GitBranch size={14} />
            <span>{branch}</span>
          </button>
        </div>

        {menu === "project" && (
          <div className={`${menuBox} w-[280px]`} role="menu">
            <input
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder={t("searchProject")}
              className="w-full bg-[#1e1e1e] border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] mb-1 outline-none"
              aria-label={t("searchProject")}
            />
            {filteredRepos.length === 0 && (
              <div className="px-2.5 py-2 text-[13px] text-codex-muted">{t("noRepos")}</div>
            )}
            {filteredRepos.map((p: GitRepo) => (
              <button
                key={p.path}
                type="button"
                role="menuitem"
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[13px] ${
                  project === p.name ? "bg-[#353535]" : "hover:bg-[#353535]"
                }`}
                onClick={() => {
                  setProject(p.name);
                  setProjectQuery("");
                  setMenu(null);
                }}
              >
                <Folder size={14} />
                <span className="truncate">{p.name}</span>
                {p.current_branch && (
                  <span className="text-[11px] text-codex-muted ml-auto shrink-0">{p.current_branch}</span>
                )}
              </button>
            ))}
            <div className="h-px bg-[#3a3a3a] my-1.5" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[13px] hover:bg-[#353535]"
              onClick={() => {
                toast.info(t("newProjectToast"));
                setMenu(null);
              }}
            >
              <Plus size={14} />
              {t("newProject")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[13px] hover:bg-[#353535]"
              onClick={() => {
                setProject("");
                setMenu(null);
              }}
            >
              {t("noProject")}
            </button>
          </div>
        )}

        {menu === "env" && (
          <div className={`${menuBox} w-[260px]`} role="menu">
            <div className="px-2.5 py-1.5 text-[11.5px] text-codex-muted">{t("envWorkLocation")}</div>
            {envOptions.map(([id, labelKey, external]) => (
              <button
                key={id}
                type="button"
                disabled={id === "cloud"}
                className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md text-[13px] ${
                  env === id ? "bg-[#353535]" : "hover:bg-[#353535]"
                } disabled:opacity-40`}
                onClick={() => {
                  setEnv(id);
                  setMenu(null);
                }}
              >
                {id === "local" || id === "cloud" ? <Monitor size={14} /> : <GitBranch size={14} />}
                <span className="flex-1">{t(labelKey)}</span>
                {external && <ExternalLink size={12} className="text-codex-muted" />}
              </button>
            ))}
          </div>
        )}

        {menu === "branch" && (
          <div className={`${menuBox} w-[280px]`} role="menu">
            <input
              value={branchQuery}
              onChange={(e) => setBranchQuery(e.target.value)}
              placeholder={t("searchBranch")}
              className="w-full bg-[#1e1e1e] border border-[#333] rounded-md px-2.5 py-1.5 text-[12.5px] mb-1 outline-none"
              aria-label={t("searchBranch")}
            />
            {loadingBranches ? (
              <div className="px-2.5 py-2 text-[13px] text-codex-muted flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                {t("loadingBranches")}
              </div>
            ) : filteredBranches.length === 0 ? (
              <div className="px-2.5 py-2 text-[13px] text-codex-muted">{t("noBranches")}</div>
            ) : (
              filteredBranches.map((b: GitBranchType) => (
                <button
                  key={b.name}
                  type="button"
                  className={`w-full text-left px-2.5 py-2 rounded-md text-[13px] ${
                    branch === b.name ? "bg-[#353535]" : "hover:bg-[#353535]"
                  }`}
                  onClick={() => {
                    setBranch(b.name);
                    setBranchQuery("");
                    setMenu(null);
                  }}
                >
                  <span className={b.is_current ? "text-codex-accent" : ""}>{b.name}</span>
                  {b.is_current && (
                    <span className="ml-2 text-[11px] text-codex-muted">({t("branchCurrent")})</span>
                  )}
                  {b.is_remote && (
                    <span className="ml-2 text-[11px] text-codex-muted">{t("branchRemote")}</span>
                  )}
                </button>
              ))
            )}
            <div className="h-px bg-[#3a3a3a] my-1.5" role="separator" />
            {creatingBranch ? (
              <div className="flex gap-1 px-1 pb-1">
                <input
                  autoFocus
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitCreateBranch();
                    if (e.key === "Escape") setCreatingBranch(false);
                  }}
                  placeholder={t("createBranchPrompt")}
                  className="flex-1 bg-[#1e1e1e] border border-[#333] rounded-md px-2 py-1.5 text-[12.5px] outline-none"
                />
                <button
                  type="button"
                  onClick={commitCreateBranch}
                  className="px-2 rounded-md bg-codex-accent text-white text-[12px]"
                >
                  <Plus size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[13px] hover:bg-[#353535]"
                onClick={() => setCreatingBranch(true)}
              >
                <Plus size={14} />
                {t("createBranch")}
              </button>
            )}
          </div>
        )}

        <div className="px-3 py-2">
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
        </div>

        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 relative">
          <button
            type="button"
            onClick={() => toggle("add")}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#aaa] hover:bg-[#2a2a2a]"
            aria-label={t("add")}
            title={t("add")}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => toggle("perm")}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] ${
              perm === "full" ? "text-codex-warn" : "text-[#c0c0c0]"
            } hover:bg-[#2a2a2a]`}
            aria-label={permLabel}
          >
            <ShieldAlert size={14} />
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
          <button
            type="button"
            onClick={() => toggle("model")}
            className="inline-flex items-center gap-1.5 text-[12px] text-[#c0c0c0] px-2 py-1 rounded-md hover:bg-[#2a2a2a]"
            aria-label={t("model")}
          >
            <span>{model}</span>
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
                  <div className="text-[13px] text-[#e0e0e0] font-medium">{model}</div>
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

          {menu === "add" && (
            <div className="absolute left-2 bottom-[calc(100%+4px)] w-[320px] max-h-[min(420px,55vh)] overflow-auto p-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl z-30">
              <div className="px-2.5 py-1 text-[11.5px] text-codex-muted">{t("addSection")}</div>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[13px] hover:bg-[#353535]"
                onClick={() => setMenu(null)}
              >
                <Paperclip size={14} className="shrink-0 text-codex-muted" />
                <span>{t("addFiles")}</span>
              </button>
              <button
                type="button"
                className="w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left text-[13px] hover:bg-[#353535]"
                onClick={() => {
                  toggle("project");
                }}
              >
                <Folder size={14} className="shrink-0 mt-0.5 text-codex-muted" />
                <span>
                  {t("addWork")}{" "}
                  <span className="text-codex-muted text-[12px]">{t("addWorkHint")}</span>
                </span>
              </button>
              <button
                type="button"
                className="w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left text-[13px] hover:bg-[#353535]"
                onClick={() => {
                  setGoalMode(true);
                  setMenu(null);
                }}
              >
                <Target size={14} className="shrink-0 mt-0.5 text-codex-muted" />
                <span>
                  {t("addGoal")}{" "}
                  <span className="text-codex-muted text-[12px]">{t("addGoalHint")}</span>
                </span>
              </button>
              <button
                type="button"
                className="w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left text-[13px] hover:bg-[#353535]"
                onClick={() => {
                  setPlanMode(true);
                  setMenu(null);
                }}
              >
                <Lightbulb size={14} className="shrink-0 mt-0.5 text-codex-muted" />
                <span>
                  {t("addPlan")}{" "}
                  <span className="text-codex-muted text-[12px]">{t("addPlanHint")}</span>
                </span>
              </button>

              <div className="px-2.5 py-1 mt-1 text-[11.5px] text-codex-muted">{t("addPlugins")}</div>
              {MOCK_MARKETPLACE.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-[#353535]"
                  onClick={() => setMenu(null)}
                >
                  <div className="text-[13px] text-[#e0e0e0]">{p.name}</div>
                  <div className="text-[11.5px] text-codex-muted">{p.desc}</div>
                </button>
              ))}

              <div className="px-2.5 py-1 mt-1 text-[11.5px] text-codex-muted">{t("addAgents")}</div>
              <button
                type="button"
                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-[#353535]"
                onClick={() => setMenu(null)}
              >
                <div className="text-[13px] text-[#e0e0e0]">{MOCK_AGENT.name}</div>
                <div className="text-[11.5px] text-codex-muted">{MOCK_AGENT.desc}</div>
              </button>

              <div className="px-2.5 py-1 mt-1 text-[11.5px] text-codex-muted">{t("addTabs")}</div>
              {MOCK_BROWSER_TABS.map((tab) => (
                <button
                  key={tab.url}
                  type="button"
                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-[#353535]"
                  onClick={() => setMenu(null)}
                >
                  <div className="text-[13px] text-[#e0e0e0]">
                    {tab.title} <span className="text-codex-muted">{tab.suffix}</span>
                  </div>
                  <div className="text-[11.5px] text-codex-muted truncate">{tab.url}</div>
                </button>
              ))}

              <div className="px-2.5 py-1 mt-1 text-[11.5px] text-codex-muted">{t("addFilesChats")}</div>
              <div className="px-2.5 py-2 text-[12px] text-codex-muted">{t("addSearchHint")}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
