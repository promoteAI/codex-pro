import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MOCK_BROWSER_TABS } from "../mock/seeds";
import { apiFetch } from "../lib/api";
import { runMutation, toast } from "../stores/toast";
import { useApi } from "../hooks/use-api";
import { useWsSubscribe } from "../hooks/use-ws";
import { useChatStore } from "../stores/chat";

interface ApiPlugin {
  name: string;
  version: string;
  description: string;
  source: string;
  path: string | null;
  status: string;
  provides_tools: string[];
  provides_hooks: string[];
  depends_on: string[];
}

/** Fallback glyph for a plugin whose name has no known shorthand. */
function PLUGIN_GLYPH(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("sheet") || lower.includes("spread")) return "Sh";
  if (lower.includes("present") || lower.includes("slide")) return "Sl";
  if (lower.includes("doc") || lower.includes("document")) return "Do";
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("figma")) return "Fi";
  if (lower.includes("notion")) return "No";
  if (lower.includes("linear")) return "Li";
  if (lower.includes("slack")) return "Sk";
  if (lower.includes("jira")) return "Ji";
  if (lower.includes("terminal") || lower.includes("term")) return ">_";
  if (lower.includes("browser") || lower.includes("web")) return "Br";
  if (lower.includes("github") || lower.includes("git")) return "GH";
  if (lower.includes("computer") || lower.includes("use")) return "CU";
  if (lower.includes("automate")) return "Au";
  if (lower.includes("canvas")) return "Ca";
  if (lower.includes("hook")) return "Ho";
  if (lower.includes("rule")) return "Rl";
  if (lower.includes("skill")) return "Sk";
  if (lower.includes("agent") || lower.includes("subagent")) return "Ag";
  return name.substring(0, 2).toUpperCase();
}

/** Fallback box color for a plugin that ships no icon of its own. */
function PLUGIN_COLOR(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("computer") || lower.includes("use")) return "#1b5e20";
  if (lower.includes("sheet")) return "#0f9d58";
  if (lower.includes("present")) return "#f4b400";
  if (lower.includes("doc") || lower.includes("document")) return "#4285f4";
  if (lower.includes("pdf")) return "#ea4335";
  if (lower.includes("figma")) return "#7c4dff";
  if (lower.includes("notion")) return "#00c853";
  if (lower.includes("linear")) return "#ff6d00";
  if (lower.includes("slack")) return "#0091ea";
  if (lower.includes("jira")) return "#c2185b";
  if (lower.includes("terminal")) return "#455a64";
  if (lower.includes("browser")) return "#6a1b9a";
  if (lower.includes("github") || lower.includes("git")) return "#24292f";
  if (lower.includes("automate")) return "#5b8def";
  if (lower.includes("canvas")) return "#7c5cff";
  if (lower.includes("hook")) return "#fb7185";
  if (lower.includes("rule")) return "#fbbf24";
  if (lower.includes("skill")) return "#c084fc";
  if (lower.includes("agent") || lower.includes("subagent")) return "#67e8f9";
  if (lower.includes("design")) return "#a78bfa";
  if (lower.includes("file")) return "#818cf8";
  return "#6e6e6e";
}

const EXTRA_TABS = [
  ...MOCK_BROWSER_TABS,
  {
    title: "www. ···",
    suffix: "· Chrome",
    url: "https://www.google.com.hk/goto?url=...",
    globe: true,
  },
];

/** A runtime worker profile served by GET /api/v1/agents. */
interface WorkerAgent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  default_tools: string[];
  model: string;
  provider: string;
  max_iterations: number;
  max_tokens: number;
  temperature: number;
}

interface AddAgentFormProps {
  onSaved: () => void;
  onCancel: () => void;
}

/** Inline "add agent" form shown inside the composer add menu. */
function AddAgentForm({ onSaved, onCancel }: AddAgentFormProps) {
  const { t } = useTranslation("composer");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [tools, setTools] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      id: id.trim(),
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      model: model.trim(),
      default_tools: tools.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const ok = await runMutation(
      () => apiFetch("/agents", { method: "POST", body: JSON.stringify(body) }),
      { success: t("agentSaved"), error: t("agentSaveFailed") },
    );
    if (ok) {
      onSaved();
      onCancel();
    }
  };

  return (
    <form className="add-agent-form" onSubmit={submit}>
      <div className="add-menu-sec">{t("agentNew")}</div>
      <input
        className="add-agent-input"
        placeholder={`${t("agentId")} *`}
        value={id}
        onChange={(e) => setId(e.target.value)}
        required
      />
      <input
        className="add-agent-input"
        placeholder={`${t("agentName")} *`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="add-agent-input"
        placeholder={t("agentDesc")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <textarea
        className="add-agent-input add-agent-area"
        placeholder={t("agentInstructions")}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />
      <input
        className="add-agent-input"
        placeholder={t("agentModel")}
        value={model}
        onChange={(e) => setModel(e.target.value)}
      />
      <input
        className="add-agent-input"
        placeholder={t("agentDefaultTools")}
        value={tools}
        onChange={(e) => setTools(e.target.value)}
      />
      <div className="add-agent-actions">
        <button type="button" className="add-agent-btn" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="submit" className="add-agent-btn primary">
          {t("create")}
        </button>
      </div>
    </form>
  );
}

interface ComposerAddMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onOpenProject: () => void;
  onGoal: () => void;
  onPlan: () => void;
}

/** Prototype #addMenu — composer + menu with plugins / agents / tabs. */
export function ComposerAddMenu({
  open,
  anchorEl,
  onClose,
  onOpenProject,
  onGoal,
  onPlan,
}: ComposerAddMenuProps) {
  const { t } = useTranslation("composer");
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [addingAgent, setAddingAgent] = useState(false);

  // Runtime worker profiles from the backend; null path while menu closed so
  // the request is not fired on every render.
  const {
    data: agentsData,
    loading: agentsLoading,
    refetch: refetchAgents,
  } = useApi<{ agents: WorkerAgent[] }>(open ? "/agents" : null);

  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const deleteAgent = async (agent: WorkerAgent) => {
    const ok = await runMutation(
      () => apiFetch(`/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" }),
      { success: t("agentDeleted"), error: t("agentDeleteFailed") },
    );
    if (ok) refetchAgents();
  };

  // Real plugin list from the gateway; empty/error renders a placeholder.
  const {
    data: pluginsData,
    loading: pluginsLoading,
    error: pluginsError,
    refetch: refetchPlugins,
  } = useApi<{ plugins: ApiPlugin[] }>(open ? "/plugins" : null);
  useWsSubscribe(["plugins"], () => refetchPlugins(), ["plugin_changed"]);

  const openPlugins = () => {
    onClose();
    navigate("/plugins");
  };

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuH = menuRef.current?.offsetHeight || 420;
      const menuW = Math.min(420, window.innerWidth - 24);
      let top = rect.top - menuH - 8;
      if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - Math.min(menuH, window.innerHeight - 16) - 8);
      let left = Math.min(rect.left, window.innerWidth - menuW - 8);
      if (left < 8) left = 8;
      setPos({ top: Math.round(top), left: Math.round(left) });
    };
    place();
    const id = window.setTimeout(place, 0);
    return () => window.clearTimeout(id);
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onResize = () => onClose();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, anchorEl, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="add-menu open"
      id="addMenu"
      role="menu"
      aria-label={t("add")}
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="add-menu-sec">{t("addSection")}</div>
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onClose();
          fileInputRef.current?.click();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8.5 14.5 7-7a2.5 2.5 0 0 1 3.5 3.5l-8.5 8.5a4 4 0 0 1-5.7-5.7l8.2-8.2" />
          <path d="M14 7.5 16.5 10" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">{t("addFiles")}</span>
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const addFile = useChatStore.getState().addFile;
          for (const file of files) void addFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onClose();
          onOpenProject();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">
            {t("addWork")} <span className="muted">{t("addWorkHint")}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onGoal();
          onClose();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">
            {t("addGoal")} <span className="muted">{t("addGoalHint")}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={() => {
          onPlan();
          onClose();
        }}
      >
        <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 18h6M10 21h4" />
          <path d="M8.5 14c-.8-1-1.3-2.1-1.3-3.4A4.8 4.8 0 0 1 12 5.8 4.8 4.8 0 0 1 16.8 10.6c0 1.3-.5 2.4-1.3 3.4-.6.7-1.2 1.2-1.5 2H10c-.3-.8-.9-1.3-1.5-2Z" />
        </svg>
        <span className="add-menu-body">
          <span className="add-menu-title">
            {t("addPlan")} <span className="muted">{t("addPlanHint")}</span>
          </span>
        </span>
      </button>

      <div className="add-menu-sec">{t("addPlugins")}</div>
      {pluginsLoading && (
        <div className="add-menu-hint">{t("pluginsLoading")}</div>
      )}
      {!pluginsLoading && pluginsError && (
        <div className="add-menu-hint">{t("pluginsError")}</div>
      )}
      {!pluginsLoading && !pluginsError && (pluginsData?.plugins?.length ?? 0) === 0 && (
        <div className="add-menu-hint">{t("pluginsEmpty")}</div>
      )}
      {!pluginsLoading &&
        !pluginsError &&
        (pluginsData?.plugins ?? []).map((p) => (
          <button
            key={p.name}
            type="button"
            className="add-menu-item"
            role="menuitem"
            onClick={openPlugins}
          >
            <span
              className="add-menu-ico-box"
              style={{ background: PLUGIN_COLOR(p.name) }}
              aria-hidden="true"
            >
              {PLUGIN_GLYPH(p.name)}
            </span>
            <span className="add-menu-body">
              <span className="add-menu-title">{p.name}</span>
              <span className="add-menu-desc">{p.description || "—"}</span>
            </span>
          </button>
        ))}
      <button
        type="button"
        className="add-menu-item"
        role="menuitem"
        onClick={openPlugins}
      >
        <span className="add-menu-ico-box sp" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1" />
            <path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1" />
          </svg>
        </span>
        <span className="add-menu-body">
          <span className="add-menu-title">Superpowers</span>
          <span className="add-menu-desc">Plan, develop, and debug code</span>
        </span>
      </button>

      <div className="add-menu-sec">{t("addAgents")}</div>
      {addingAgent ? (
        <AddAgentForm
          onSaved={refetchAgents}
          onCancel={() => setAddingAgent(false)}
        />
      ) : agentsLoading ? (
        <div className="add-menu-hint">{t("loadingAgents")}</div>
      ) : agents.length === 0 ? (
        <div className="add-menu-hint">{t("noAgents")}</div>
      ) : (
        agents.map((agent) => (
          <div key={agent.id} className="add-agent-row">
            <button
              type="button"
              className="add-menu-item"
              role="menuitem"
              onClick={() => {
                onClose();
                toast.info(agent.name);
              }}
            >
              <span className="add-menu-body">
                <span className="add-menu-title">{agent.name}</span>
                <span className="add-menu-desc">{agent.description || agent.id}</span>
              </span>
            </button>
            <button
              type="button"
              className="add-agent-remove"
              aria-label={`${t("agentDelete")}: ${agent.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void deleteAgent(agent);
              }}
            >
              ×
            </button>
          </div>
        ))
      )}
      {!addingAgent && (
        <button
          type="button"
          className="add-menu-item"
          role="menuitem"
          onClick={() => setAddingAgent(true)}
        >
          <span className="add-menu-body">
            <span className="add-menu-title">{t("agentNew")}</span>
          </span>
        </button>
      )}

      <div className="add-menu-sec">{t("addTabs")}</div>
      {EXTRA_TABS.map((tab) => (
        <button
          key={tab.url}
          type="button"
          className="add-menu-item"
          role="menuitem"
          onClick={() => {
            onClose();
            toast.info(tab.title);
          }}
        >
          {"globe" in tab && tab.globe ? (
            <svg className="add-menu-ico" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M3.5 12h17M12 3.5a14 14 0 0 1 0 17M12 3.5a14 14 0 0 0 0 17" />
            </svg>
          ) : (
            <span className="add-menu-ico-box g" aria-hidden="true">
              G
            </span>
          )}
          <span className="add-menu-body">
            <span className="add-menu-row">
              <span className="add-menu-title">{tab.title}</span>
              <span className="add-menu-suffix">{tab.suffix}</span>
            </span>
            <span className="add-menu-desc">{tab.url}</span>
          </span>
        </button>
      ))}

      <div className="add-menu-sec">{t("addFilesChats")}</div>
      <div className="add-menu-hint">{t("addSearchHint")}</div>
      <div className="add-menu-sec">{t("placeholder")}</div>
    </div>,
    document.body,
  );
}
