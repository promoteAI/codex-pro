import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as api from "../lib/api";
import { useSettingsStore, DEFAULT_PREFS, type UIPreferences } from "./settings";
import { useToastStore } from "./toast";

function mockFetch(impl: (path: string, init?: RequestInit) => unknown) {
  return vi.spyOn(api, "apiFetch").mockImplementation(impl as never);
}

beforeEach(() => {
  useSettingsStore.getState().reset();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings store", () => {
  it("loadPrefs 拉取 /config 并把 ui.preferences 的 snake_case 映射为 camelCase", async () => {
    mockFetch(async (path: string) => {
      if (path === "/config") {
        return {
          ui: {
            preferences: {
              theme: "light",
              contrast: 60,
              worktree_auto_delete: false,
              codex_instructions: "always use English",
            },
          },
        } as never;
      }
      return {} as never;
    });

    await useSettingsStore.getState().loadPrefs();

    const prefs = useSettingsStore.getState().prefs;
    expect(prefs.theme).toBe("light");
    expect(prefs.contrast).toBe(60);
    expect(prefs.worktreeAutoDelete).toBe(false);
    expect(prefs.codexInstructions).toBe("always use English");
    // 未返回的字段保持默认,避免把后端缺失项清成 undefined。
    expect(prefs.terminalPosition).toBe("bottom");
    expect(prefs.gitMergeMethod).toBe("merge");
    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useSettingsStore.getState().loading).toBe(false);
  });

  it("loadPrefs 失败(如非 admin)时保留默认值并记录 error", async () => {
    mockFetch(async () => {
      throw new Error("Unauthorized");
    });

    await useSettingsStore.getState().loadPrefs();

    const state = useSettingsStore.getState();
    expect(state.prefs).toEqual(DEFAULT_PREFS);
    expect(state.error).toBe("Unauthorized");
    expect(state.loaded).toBe(false);
    expect(state.loading).toBe(false);
  });

  it("updatePrefs 乐观更新 prefs 并以 ui.preferences.<snake> 提交 PATCH", async () => {
    const spy = mockFetch(async () => ({ success: true } as never));

    await useSettingsStore.getState().updatePrefs({
      theme: "light",
      worktreeAutoDelete: false,
      gitBranchPrefix: "feat/",
    });

    // 乐观更新已生效。
    const prefs = useSettingsStore.getState().prefs;
    expect(prefs.theme).toBe("light");
    expect(prefs.worktreeAutoDelete).toBe(false);
    expect(prefs.gitBranchPrefix).toBe("feat/");

    expect(spy).toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"ui.preferences.theme":"light"'),
      }),
    );
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.changes).toEqual({
      "ui.preferences.theme": "light",
      "ui.preferences.worktree_auto_delete": false,
      "ui.preferences.git_branch_prefix": "feat/",
    });
    // 仅提交被触碰的键,而非整个 prefs 对象。
    expect(Object.keys(body.changes)).toHaveLength(3);
  });

  it("updatePrefs 失败时回滚 saving 标记并弹错误 toast", async () => {
    mockFetch(async () => {
      throw new Error("field is read-only");
    });

    await useSettingsStore.getState().updatePrefs({ theme: "light" });

    const state = useSettingsStore.getState();
    expect(state.saving).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((tst) => tst.kind === "error")).toBe(true);
  });

  it("reset 恢复默认 prefs", () => {
    useSettingsStore.setState({ prefs: { ...DEFAULT_PREFS, theme: "light" } as UIPreferences, loaded: true });
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().prefs).toEqual(DEFAULT_PREFS);
    expect(useSettingsStore.getState().loaded).toBe(false);
  });
});
