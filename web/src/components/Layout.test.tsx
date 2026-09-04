import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Layout } from "./Layout";
import { useCapabilitiesStore } from "../stores/capabilities";
import { useAuthStore } from "../stores/auth";
import * as api from "../lib/api";

const originalFetch = globalThis.fetch;

function renderAt(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<div>dashboard-content</div>} />
        </Route>
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useCapabilitiesStore.getState().reset();
  useAuthStore.setState({ token: null });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Layout", () => {
  it("无 token 时直接进入主界面，不再跳转登录页", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ admin: true, authRequired: true });

    renderAt();

    expect(await screen.findByText("dashboard-content")).toBeTruthy();
    expect(screen.queryByText("login-page")).toBeNull();
  });

  it("open 模式空 token 也能进入", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ admin: true, authRequired: false });

    renderAt();

    expect(await screen.findByText("dashboard-content")).toBeTruthy();
  });

  it("有 token 时直接进入", () => {
    vi.spyOn(api, "apiFetch").mockReturnValue(new Promise(() => {}) as never);
    useAuthStore.setState({ token: "tok" });

    renderAt();

    expect(screen.getByText("dashboard-content")).toBeTruthy();
  });

  it("探测未返回前也渲染主界面，不空白屏", () => {
    vi.spyOn(api, "apiFetch").mockReturnValue(new Promise(() => {}) as never);

    renderAt();

    expect(screen.getByText("dashboard-content")).toBeTruthy();
    expect(screen.queryByText("login-page")).toBeNull();
  });
});
