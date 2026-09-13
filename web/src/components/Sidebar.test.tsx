import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("默认中文渲染菜单", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText("新对话")).toBeInTheDocument();
  });

  it("账户菜单可打开并包含使用统计/设置", async () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("账户"));
    await waitFor(() => expect(screen.getByText("使用统计")).toBeInTheDocument());
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.queryByText("远程连接")).not.toBeInTheDocument();
  });

  it("使用统计与设置带快捷键标注", async () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("账户"));
    await waitFor(() => expect(screen.getByText("使用统计")).toBeInTheDocument());
    expect(screen.getByText(/Alt\+Win\+P|⌥⌘P/)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+,|⌘,/)).toBeInTheDocument();
  });
});
