import { create } from "zustand";
import { apiFetch } from "../lib/api";
import { toast } from "./toast";

/** Client-side UI preferences surfaced on the settings pages. These mirror the
 *  `ui.preferences` block in the backend config schema so they round-trip
 *  through the generic /config GET/PATCH API. */

export type ThemeMode = "system" | "light" | "dark";
export type TerminalPosition = "bottom" | "right";
export type FollowUpMode = "queue" | "steer";
export type GitMergeMethod = "merge" | "squash";
export type GitReviewPresentation = "inline" | "separate";
export type AgentEnv = "windows_native" | "wsl";

export interface UIPreferences {
  // Appearance
  theme: ThemeMode;
  contrast: number;
  translucentSidebar: boolean;
  // General / editor
  noProjectFolder: string;
  agentEnv: AgentEnv;
  openIn: string;
  integratedShell: string;
  terminalPosition: TerminalPosition;
  bottomPanel: boolean;
  pluginsEnabled: boolean;
  plainEditor: boolean;
  showContextUsage: boolean;
  followUpMode: FollowUpMode;
  standaloneChat: boolean;
  defaultPermissions: boolean;
  fullAccess: boolean;
  permissionNotify: boolean;
  questionNotify: boolean;
  turnNotifyMode: string;
  // Agent
  sandbox: "read_only" | "workspace_write" | "full_access";
  verbosity: "low" | "medium" | "high";
  webSearch: boolean;
  ultraInPicker: boolean;
  reasoningLevels: string[];
  reasoningSummary: "auto" | "concise" | "detailed" | "none";
  approvalPolicy: "ask_on_escalation" | "never_ask";
  workspaceDeps: boolean;
  // Personalization
  codexInstructions: string;
  localMemory: boolean;
  toolMemory: boolean;
  // Computer control
  allowAnyScreen: boolean;
  chromeEnabled: boolean;
  excelEnabled: boolean;
  // Browser
  embeddedBrowser: boolean;
  ignoreCert: boolean;
  // Git
  gitBranchPrefix: string;
  gitMergeMethod: GitMergeMethod;
  gitForcePush: boolean;
  gitDraftPr: boolean;
  gitReviewPresentation: GitReviewPresentation;
  gitAutoMerge: boolean;
  gitMonitorInstr: string;
  gitCommitInstr: string;
  gitPrInstr: string;
  // Worktrees
  worktreeRoot: string;
  worktreePullUpstream: boolean;
  worktreeAutoDelete: boolean;
  worktreeDeleteLimit: number;
}

// Keys that arrive over the wire as snake_case (the backend model_dump leaves
// them in snake_case; only the PATCH path and GET field names use snake_case).
const WIRE_KEYS: Record<keyof UIPreferences, string> = {
  theme: "theme",
  contrast: "contrast",
  translucentSidebar: "translucent_sidebar",
  noProjectFolder: "no_project_folder",
  agentEnv: "agent_env",
  openIn: "open_in",
  integratedShell: "integrated_shell",
  terminalPosition: "terminal_position",
  bottomPanel: "bottom_panel",
  pluginsEnabled: "plugins_enabled",
  plainEditor: "plain_editor",
  showContextUsage: "show_context_usage",
  followUpMode: "follow_up_mode",
  standaloneChat: "standalone_chat",
  defaultPermissions: "default_permissions",
  fullAccess: "full_access",
  permissionNotify: "permission_notify",
  questionNotify: "question_notify",
  turnNotifyMode: "turn_notify_mode",
  sandbox: "sandbox",
  verbosity: "verbosity",
  webSearch: "web_search",
  ultraInPicker: "ultra_in_picker",
  reasoningLevels: "reasoning_levels",
  reasoningSummary: "reasoning_summary",
  approvalPolicy: "approval_policy",
  workspaceDeps: "workspace_deps",
  codexInstructions: "codex_instructions",
  localMemory: "local_memory",
  toolMemory: "tool_memory",
  allowAnyScreen: "allow_any_screen",
  chromeEnabled: "chrome_enabled",
  excelEnabled: "excel_enabled",
  embeddedBrowser: "embedded_browser",
  ignoreCert: "ignore_cert",
  gitBranchPrefix: "git_branch_prefix",
  gitMergeMethod: "git_merge_method",
  gitForcePush: "git_force_push",
  gitDraftPr: "git_draft_pr",
  gitReviewPresentation: "git_review_presentation",
  gitAutoMerge: "git_auto_merge",
  gitMonitorInstr: "git_monitor_instr",
  gitCommitInstr: "git_commit_instr",
  gitPrInstr: "git_pr_instr",
  worktreeRoot: "worktree_root",
  worktreePullUpstream: "worktree_pull_upstream",
  worktreeAutoDelete: "worktree_auto_delete",
  worktreeDeleteLimit: "worktree_delete_limit",
};

export const DEFAULT_PREFS: UIPreferences = {
  theme: "dark",
  contrast: 45,
  translucentSidebar: true,
  noProjectFolder: "",
  agentEnv: "windows_native",
  openIn: "vscode",
  integratedShell: "PowerShell",
  terminalPosition: "bottom",
  bottomPanel: true,
  pluginsEnabled: true,
  plainEditor: false,
  showContextUsage: false,
  followUpMode: "queue",
  standaloneChat: false,
  defaultPermissions: true,
  fullAccess: true,
  permissionNotify: true,
  questionNotify: true,
  turnNotifyMode: "unfocused",
  sandbox: "full_access",
  verbosity: "medium",
  webSearch: true,
  ultraInPicker: false,
  reasoningLevels: ["low", "medium", "high", "xhigh", "max", "Ultra"],
  reasoningSummary: "auto",
  approvalPolicy: "never_ask",
  workspaceDeps: true,
  codexInstructions: "",
  localMemory: false,
  toolMemory: true,
  allowAnyScreen: true,
  chromeEnabled: true,
  excelEnabled: true,
  embeddedBrowser: true,
  ignoreCert: true,
  gitBranchPrefix: "codex_pro",
  gitMergeMethod: "merge",
  gitForcePush: false,
  gitDraftPr: true,
  gitReviewPresentation: "separate",
  gitAutoMerge: false,
  gitMonitorInstr: "",
  gitCommitInstr: "",
  gitPrInstr: "",
  worktreeRoot: "",
  worktreePullUpstream: false,
  worktreeAutoDelete: true,
  worktreeDeleteLimit: 15,
};

function fromWire(raw: Record<string, unknown>): Partial<UIPreferences> {
  const out: Partial<UIPreferences> = {};
  for (const [camel, snake] of Object.entries(WIRE_KEYS) as Array<[keyof UIPreferences, string]>) {
    if (snake in raw && raw[snake] !== undefined) {
      (out as Record<string, unknown>)[camel] = raw[snake];
    }
  }
  return out;
}

interface SettingsState {
  /** UI preferences, seeded with DEFAULT_PREFS and replaced on load. */
  prefs: UIPreferences;
  /** Whether a successful load has happened this session. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  saving: boolean;
  loadPrefs: () => Promise<void>;
  /** Optimistically merge `patch` into prefs and PATCH only the touched keys. */
  updatePrefs: (patch: Partial<UIPreferences>) => Promise<void>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  prefs: DEFAULT_PREFS,
  loaded: false,
  loading: false,
  error: null,
  saving: false,

  loadPrefs: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<{ ui?: { preferences?: Record<string, unknown> } }>("/config");
      const raw = data.ui?.preferences ?? {};
      set({
        prefs: { ...DEFAULT_PREFS, ...fromWire(raw) },
        loaded: true,
        loading: false,
      });
    } catch (e: unknown) {
      // Keep the seeded defaults so pages still render; a non-admin token has
      // no /config access and this degrades to the previous visual-only state.
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  updatePrefs: async (patch) => {
    const next = { ...get().prefs, ...patch };
    set({ prefs: next, saving: true });
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch) as Array<[keyof UIPreferences, unknown]>) {
      changes[`ui.preferences.${WIRE_KEYS[key]}`] = value;
    }
    try {
      await apiFetch("/config", {
        method: "PATCH",
        body: JSON.stringify({ changes }),
      });
      set({ saving: false });
    } catch (e: unknown) {
      set({ saving: false });
      toast.error(e instanceof Error ? e.message : String(e));
    }
  },

  reset: () =>
    set({
      prefs: DEFAULT_PREFS,
      loaded: false,
      loading: false,
      error: null,
      saving: false,
    }),
}));
