import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Config } from "./Config";
import * as api from "../lib/api";
import { useCapabilitiesStore } from "../stores/capabilities";

/**
 * The contract this page now depends on: /config is admin-guarded end to end,
 * so a non-admin session must never fire the request. Before the capabilities
 * probe existed the page always fetched and rendered "加载失败：403", which reads
 * like a server fault rather than a permission boundary.
 */
beforeEach(() => {
  useCapabilitiesStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Config 页", () => {
  it("admin 令牌下拉取并展示配置 JSON", async () => {
    const spy = vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/capabilities") return { admin: true } as never;
      return { agent: { name: "codex" } } as never;
    });

    render(<Config />);

    await waitFor(() => expect(screen.getByText(/"codex"/)).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith("/config", expect.anything());
  });

  it("非 admin 令牌下不请求 /config,只提示权限不足", async () => {
    const spy = vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/capabilities") return { admin: false } as never;
      throw new Error("403");
    });

    render(<Config />);

    await waitFor(() =>
      expect(screen.getByText(/需要管理员令牌/)).toBeInTheDocument(),
    );
    expect(spy).not.toHaveBeenCalledWith("/config");
    // 不能退化成通用的“加载失败”提示。
    expect(screen.queryByText(/加载失败/)).not.toBeInTheDocument();
  });

  it("探测失败时按乐观策略仍然请求,由端点自身的错误说话", async () => {
    const spy = vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/capabilities") throw new Error("404");
      throw new Error("boom");
    });

    render(<Config />);

    await waitFor(() => expect(screen.getByText(/加载失败：boom/)).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith("/config", expect.anything());
  });

  it("permissions 分区展示审批设置并在保存时提交 permissions.approval 字段", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/capabilities") return { admin: true } as never;
      return {
        permissions: {
          approval: {
            mode: "smart",
            smart_model: "m1",
            unattended_policy: "deny",
            cli_auto_approve: true,
          },
        },
      } as never;
    });

    render(<Config />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("m1")).toBeInTheDocument(),
    );

    const saveSpy = vi.spyOn(api, "apiFetch");
    vi.mocked(api.apiFetch).mockImplementation(async (path: string) => {
      if (path === "/capabilities") return { admin: true } as never;
      return { success: true } as never;
    });

    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        "/config",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"permissions.approval.mode"'),
        }),
      ),
    );
  });

  it("保存返回 hot_reload 时不提示需重启(permissions 已即时生效)", async () => {
    let patched = false;
    vi.spyOn(api, "apiFetch").mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === "/capabilities") return { admin: true } as never;
      if (init?.method === "PATCH") {
        patched = true;
        return { hot_reload: true } as never;
      }
      return { permissions: { approval: { mode: "smart", smart_model: "m1" } } } as never;
    });

    render(<Config />);
    await waitFor(() => expect(screen.getByDisplayValue("m1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    await waitFor(() => expect(patched).toBe(true));
    // hot_reload:true → permissions 已生效,不应弹出"需重启"横幅。
    expect(screen.queryByText(/重启/)).not.toBeInTheDocument();
  });
});
