import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { GeneralPage } from "./CorePages";
import { WorktreesPage } from "./MorePages";
import * as api from "../../../lib/api";
import { useSettingsStore } from "../../../stores/settings";
import { useToastStore } from "../../../stores/toast";

beforeEach(() => {
  useSettingsStore.getState().reset();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** GET /config returns the given prefs; PATCH records the body and returns success. */
function mockConfig(prefs: Record<string, unknown>) {
  const patchCalls: Record<string, unknown>[] = [];
  vi.spyOn(api, "apiFetch").mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patchCalls.push(JSON.parse((init.body as string) ?? "{}").changes ?? {});
      return { success: true } as never;
    }
    if (path === "/config") return { ui: { preferences: prefs } } as never;
    return {} as never;
  });
  return patchCalls;
}

describe("settings pages 持久化", () => {
  it("GeneralPage 挂载后从 /config 载入默认权限开关", async () => {
    mockConfig({ full_access: false, default_permissions: true });
    render(<GeneralPage />);

    await waitFor(() => expect(useSettingsStore.getState().prefs.fullAccess).toBe(false));
  });

  it("GeneralPage 切换完整访问权限时提交 ui.preferences.full_access", async () => {
    const patchCalls = mockConfig({ full_access: true });
    render(<GeneralPage />);
    await waitFor(() => expect(useSettingsStore.getState().loaded).toBe(true));

    fireEvent.click(screen.getByRole("checkbox", { name: "完整访问权限" }));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({ "ui.preferences.full_access": false });
  });

  it("WorktreesPage 修改根目录后在失焦时提交 ui.preferences.worktree_root", async () => {
    const patchCalls = mockConfig({});
    render(<WorktreesPage />);
    await waitFor(() => expect(useSettingsStore.getState().loaded).toBe(true));

    const input = screen.getByDisplayValue("C:/Users/cheris/.codex/worktrees");
    fireEvent.change(input, { target: { value: "C:/Users/cheris/.worktrees" } });
    fireEvent.blur(input);

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({ "ui.preferences.worktree_root": "C:/Users/cheris/.worktrees" });
  });
});
