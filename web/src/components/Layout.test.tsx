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
  it("authRequired=true 且无 token 时跳转登录页", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ admin: true, authRequired: true });
    useAuthStore.setState({ token: null });

    renderAt();

    expect(await screen.findByText("login-page")).toBeTruthy();
    expect(screen.queryByText("dashboard-content")).toBeNull();
  });

  it("open 模式（authRequired=false）空 token 也能进入", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ admin: true, authRequired: false });

    renderAt();

    expect(await screen.findByText("dashboard-content")).toBeTruthy();
  });

  it("authRequired=true 且有 token 时进入主界面", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({ admin: true, authRequired: true });
    useAuthStore.setState({ token: "tok" });

    renderAt();

    expect(await screen.findByText("dashboard-content")).toBeTruthy();
    expect(screen.queryByText("login-page")).toBeNull();
  });

  it("探测未返回前（authRequired=null）渲染占位，不渲染主界面也不跳登录", () => {
    vi.spyOn(api, "apiFetch").mockReturnValue(new Promise(() => {}) as never);
    useAuthStore.setState({ token: null });

    renderAt();

    expect(screen.queryByText("dashboard-content")).toBeNull();
    expect(screen.queryByText("login-page")).toBeNull();
  });
});
