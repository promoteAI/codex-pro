import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ConnectionsPage } from "./settings/pages/MorePages";
import { useShellStore } from "../stores/shell";
import { useAuthStore } from "../stores/auth";
import * as api from "../lib/api";

const MOCK_CONNECTIONS = {
  connections: [
    {
      name: "prod", host: "10.0.0.1", port: 22, user: "root",
      auth_method: "identity", identity_file: "~/.ssh/id_ed25519", has_password: false,
    },
    {
      name: "staging", host: "10.0.1.2", port: 2222, user: "",
      auth_method: "none", identity_file: "", has_password: false,
    },
  ],
};

function mockApi(opts: { connections?: unknown[] } = {}) {
  return vi.spyOn(api, "apiFetch").mockImplementation(async (path: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    if (path === "/connections" && method === "GET") {
      return { connections: opts.connections ?? MOCK_CONNECTIONS.connections } as never;
    }
    if (path === "/connections/refresh") {
      return { hosts: [{ host: "10.0.0.1" }, { host: "work.example.com" }] } as never;
    }
    if (path === "/connections" && method === "POST") {
      return { connection: { name: "new" } } as never;
    }
    if (method === "PUT") return { connection: {} } as never;
    if (method === "DELETE") return { status: "deleted" } as never;
    if (path.endsWith("/test") && method === "POST") {
      return { ok: true, detail: "reachable" } as never;
    }
    return {} as never;
  });
}

beforeEach(() => {
  useAuthStore.setState({ token: "" });
  useShellStore.setState({ settingsOpen: true, settingsSection: "connections" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ConnectionsPage />
    </MemoryRouter>,
  );
}

describe("ConnectionsPage", () => {
  it("renders the connection list from the API", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("prod")).toBeInTheDocument();
    });
    expect(screen.getByText("staging")).toBeInTheDocument();
    // user@host:port shown for the connection.
    expect(screen.getByText(/root@10\.0\.0\.1:22/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no connections", async () => {
    mockApi({ connections: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/通过 SSH 连接远程服务器|Connect to a remote server over SSH/)).toBeInTheDocument();
    });
  });

  it("opens the add modal with the discovery pane", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("prod")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /添加|Add/ }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText(/可用的 SSH 连接|Available SSH connections/)).toBeInTheDocument();
    expect(screen.getAllByText("work.example.com").length).toBeGreaterThan(0);
  });

  it("deletes a connection after confirming", async () => {
    mockApi();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("prod")).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByRole("button", { name: "删除" });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => {
      expect(screen.queryByText("prod")).not.toBeInTheDocument();
    });
  });

  it("shows a reachable result after testing a connection", async () => {
    mockApi();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("prod")).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("button", { name: "测试连接" })[0]);
    await waitFor(() => {
      expect(screen.getByText(/可连接|Reachable/)).toBeInTheDocument();
    });
  });
});
