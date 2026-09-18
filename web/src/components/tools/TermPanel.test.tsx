import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TermPanel } from "./TermPanel";
import { useShellStore } from "../../stores/shell";

// Mock xterm + the terminal session so the test runs without a real socket.
let termInstances: any[] = [];
let sessionInstances: any[] = [];

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    element = null as HTMLElement | null;
    cols = 80;
    rows = 24;
    constructor(public opts: any) {
      termInstances.push(this);
    }
    loadAddon() {}
    open(el: HTMLElement) {
      this.element = el;
    }
    write() {}
    onData() {
      return { dispose() {} };
    }
    onResize() {
      return { dispose() {} };
    }
    dispose() {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock("../../lib/term", () => ({
  TermSession: class {
    connect = vi.fn();
    write = vi.fn();
    resize = vi.fn();
    dispose = vi.fn();
    onData = null as any;
    onExit = null as any;
    onError = null as any;
    constructor() {
      sessionInstances.push(this);
    }
  },
}));

beforeEach(() => {
  termInstances = [];
  sessionInstances = [];
  useShellStore.setState({ termOpen: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  useShellStore.setState({ termOpen: false });
});

describe("TermPanel", () => {
  it("打开面板为初始标签建立会话连接", async () => {
    render(<TermPanel />);
    await waitFor(() => expect(sessionInstances).toHaveLength(1));
    expect(sessionInstances[0].connect).toHaveBeenCalled();
  });

  it("新建标签建立新会话", async () => {
    render(<TermPanel />);
    await waitFor(() => expect(sessionInstances).toHaveLength(1));
    fireEvent.click(screen.getByLabelText("添加标签"));
    await waitFor(() => expect(sessionInstances).toHaveLength(2));
  });

  it("关闭其他标签时 dispose 对应会话", async () => {
    render(<TermPanel />);
    await waitFor(() => expect(sessionInstances).toHaveLength(1));
    fireEvent.click(screen.getByLabelText("添加标签"));
    await waitFor(() => expect(sessionInstances).toHaveLength(2));

    const closeButtons = screen.getAllByLabelText("关闭");
    fireEvent.click(closeButtons[0]);
    await waitFor(() =>
      expect(sessionInstances.some((s) => s.dispose.mock.calls.length > 0)).toBe(true),
    );
  });

  it("面板关闭时 dispose 全部会话", async () => {
    render(<TermPanel />);
    await waitFor(() => expect(sessionInstances).toHaveLength(1));
    useShellStore.setState({ termOpen: false });
    await waitFor(() =>
      expect(sessionInstances.every((s) => s.dispose.mock.calls.length > 0)).toBe(true),
    );
  });
});
