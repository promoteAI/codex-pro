import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder, Monitor, GitBranch, Plus, ShieldAlert, ArrowUp } from "lucide-react";
import { useChatStore } from "../../stores/chat";
import { EFFORT_LABELS, MOCK_BRANCHES, MOCK_MODELS, MOCK_PROJECTS } from "../../mock/seeds";

type Menu = "project" | "env" | "branch" | "model" | "perm" | "add" | null;

export function Composer() {
  const { t } = useTranslation("composer");
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const project = useChatStore((s) => s.project);
  const env = useChatStore((s) => s.env);
  const branch = useChatStore((s) => s.branch);
  const model = useChatStore((s) => s.model);
  const effort = useChatStore((s) => s.effort);
  const perm = useChatStore((s) => s.perm);
  const setProject = useChatStore((s) => s.setProject);
  const setEnv = useChatStore((s) => s.setEnv);
  const setBranch = useChatStore((s) => s.setBranch);
  const setModel = useChatStore((s) => s.setModel);
  const setEffort = useChatStore((s) => s.setEffort);
  const setPerm = useChatStore((s) => s.setPerm);

  const [menu, setMenu] = useState<Menu>(null);
  const [modelQuery, setModelQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
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
    env === "local" ? t("envLocal") : env === "worktree" ? t("envWorktree") : env === "codex-web" ? t("envWeb") : t("envCloud");
  const permLabel =
    perm === "ask" ? t("permAsk") : perm === "agent" ? t("permAgent") : t("permFull");
  const effortLabel = [t("effortLow"), t("effortMed"), t("effortHigh"), t("effortMax")][effort] ?? EFFORT_LABELS[effort];
  const canSend = draft.trim().length > 0;

  const toggle = (m: Menu) => setMenu((cur) => (cur === m ? null : m));

  const menuBox =
    "absolute z-30 left-0 bottom-[calc(100%+6px)] min-w-[220px] max-h-72 overflow-auto p-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl";

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
            <span>{project}</span>
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
          <div className={menuBox} role="menu">
            {MOCK_PROJECTS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[13px] ${
                  project === p.id ? "bg-[#353535]" : "hover:bg-[#353535]"
                }`}
                onClick={() => {
                  setProject(p.id);
                  setMenu(null);
                }}
              >
                <Folder size={14} />
                {p.label}
              </button>
            ))}
          </div>
        )}
        {menu === "env" && (
          <div className={menuBox} role="menu">
            {(
              [
                ["local", t("envLocal")],
                ["worktree", t("envWorktree")],
                ["codex-web", t("envWeb")],
                ["cloud", t("envCloud")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={id === "cloud"}
                className={`w-full text-left px-2.5 py-2 rounded-md text-[13px] ${
                  env === id ? "bg-[#353535]" : "hover:bg-[#353535]"
                } disabled:opacity-40`}
                onClick={() => {
                  setEnv(id);
                  setMenu(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {menu === "branch" && (
          <div className={menuBox} role="menu">
            {MOCK_BRANCHES.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`w-full text-left px-2.5 py-2 rounded-md text-[13px] ${
                  branch === b.id ? "bg-[#353535]" : "hover:bg-[#353535]"
                }`}
                onClick={() => {
                  setBranch(b.id);
                  setMenu(null);
                }}
              >
                {b.label}
                {"dirty" in b && b.dirty ? (
                  <span className="block text-[11px] text-codex-muted">未提交: {b.dirty} 个文件</span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        <div className="px-3 py-2">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
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
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => toggle("model")}
            className="inline-flex items-center gap-1.5 text-[12px] text-[#c0c0c0] px-2 py-1 rounded-md hover:bg-[#2a2a2a]"
            aria-label={t("model")}
          >
            <span>{model}</span>
            <span className="text-codex-muted">{effortLabel}</span>
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
            <ArrowUp size={16} />
          </button>

          {menu === "perm" && (
            <div className="absolute left-2 bottom-[calc(100%+4px)] w-[320px] p-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl z-30">
              <div className="text-[12px] text-codex-muted px-2 py-1 mb-1">{t("permTitle")}</div>
              {(
                [
                  ["ask", t("permAsk"), t("permAskDesc")],
                  ["agent", t("permAgent"), t("permAgentDesc")],
                  ["full", t("permFullLong"), t("permFullDesc")],
                ] as const
              ).map(([id, label, desc]) => (
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
                  <div className={`text-[13px] font-medium ${id === "full" ? "text-codex-warn" : "text-[#e0e0e0]"}`}>
                    {label}
                  </div>
                  <div className="text-[11.5px] text-codex-muted mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          )}

          {menu === "model" && (
            <div className="absolute right-10 bottom-[calc(100%+4px)] w-[280px] p-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl z-30">
              <div className="px-2 py-1 text-[13px] text-[#e0e0e0] font-medium">{model}</div>
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
                <div className="text-[11px] text-codex-muted mt-1">{effortLabel}</div>
              </div>
              <input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder={t("searchModel")}
                className="w-full bg-[#1e1e1e] border border-[#333] rounded-md px-2 py-1.5 text-[12.5px] mb-1 outline-none"
              />
              <div className="max-h-40 overflow-auto">
                {MOCK_MODELS.filter((m) => m.toLowerCase().includes(modelQuery.toLowerCase())).map((m) => (
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
                ))}
              </div>
            </div>
          )}

          {menu === "add" && (
            <div className="absolute left-2 bottom-[calc(100%+4px)] w-[260px] p-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[10px] shadow-xl z-30">
              {["文件和文件夹", "目标", "计划模式"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="w-full text-left px-2.5 py-2 rounded-md text-[13px] hover:bg-[#353535]"
                  onClick={() => setMenu(null)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
