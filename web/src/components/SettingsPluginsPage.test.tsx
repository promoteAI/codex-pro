import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SettingsPluginsPage } from "./settings/pages/MorePages";
import { useShellStore } from "../stores/shell";
import { useAuthStore } from "../stores/auth";

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useShellStore.setState({ settingsOpen: true, settingsSection: "plugins" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPluginsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPluginsPage", () => {
  it("浏览目录关闭设置并跳转 /plugins", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /浏览目录|Browse catalog/i }));
    expect(useShellStore.getState().settingsOpen).toBe(false);
  });

  it("插件清单对齐原型数量", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /插件 9|Plugins 9/i })).toBeInTheDocument();
    expect(screen.getByText("Automate")).toBeInTheDocument();
    expect(screen.getByText("Baseline UI")).toBeInTheDocument();
  });

  it("技能标签展示列表而非空态", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /技能 3|Skills 3/i }));
    expect(screen.getByText("frontend-design")).toBeInTheDocument();
    expect(screen.getByText("review-security")).toBeInTheDocument();
    expect(screen.queryByText(/暂无技能|No skills/i)).not.toBeInTheDocument();
  });

  it("MCP 标签含 sqlite / browser", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /MCP 4/i }));
    expect(screen.getByText("sqlite")).toBeInTheDocument();
    expect(screen.getByText("browser")).toBeInTheDocument();
  });
});
