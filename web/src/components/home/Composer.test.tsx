import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Composer } from "./Composer";
import * as api from "../../lib/api";
import { useChatStore } from "../../stores/chat";
import { useProvidersStore } from "../../stores/providers";
import { useCapabilitiesStore } from "../../stores/capabilities";

const chatDefaults = {
  project: "",
  projectPath: "",
  env: "local",
  branch: "dev",
  model: "m",
  effort: 2,
  perm: "full" as const,
  draft: "",
  messages: [],
  sessionId: null,
  chatting: false,
  loadingHistory: false,
  historyError: null,
  typing: false,
  activeTool: null,
  pendingEventId: null,
  repos: [],
  branches: [],
  loadingBranches: false,
  planMode: false,
  goalMode: false,
  planTask: "",
  isGit: false,
};

beforeEach(() => {
  useChatStore.setState({ ...chatDefaults });
  useProvidersStore.setState({ providers: [], loading: false, activeName: null });
  useCapabilitiesStore.setState({ admin: null, authRequired: null, inflight: null, generation: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Composer 权限下拉", () => {
  it("admin 用户选择「请求批准」时 PATCH /config 写 permissions.approval.mode", async () => {
    useCapabilitiesStore.setState({ admin: true });
    const fetchSpy = vi
      .spyOn(api, "apiFetch")
      .mockImplementation(async (path: string) => {
        if (path === "/providers") return { providers: [] } as never;
        if (path === "/config") return { success: true } as never;
        throw new Error(`unexpected ${path}`);
      });

    render(<Composer />);

    fireEvent.click(screen.getByRole("button", { name: /完全访问/ }));
    fireEvent.click(screen.getAllByText("请求批准", { exact: true })[0]!);

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/config",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ changes: { "permissions.approval.mode": "manual" } }),
        }),
      ),
    );
  });
});
