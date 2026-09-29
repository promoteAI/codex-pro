import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SetupWizard } from "./SetupWizard";
import * as api from "../lib/api";

type ApiFetchSpy = MockInstance<typeof api.apiFetch>;

const GROUPS = {
  groups: [
    {
      id: "mainstream",
      label: "mainstream",
      entries: [
        { id: "openai", label: "OpenAI", dialect: "openai", api_base: "", needs_api_base: false },
        { id: "anthropic", label: "Anthropic", dialect: "anthropic", api_base: "", needs_api_base: false },
      ],
    },
  ],
};

function mockProviderLoad(apiFetch: ApiFetchSpy) {
  apiFetch
    .mockResolvedValueOnce(GROUPS)
    .mockResolvedValueOnce({ configured: false, workspace: "/tmp/desktop-workspace" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SetupWizard", () => {
  it("loads providers and renders a selectable list", async () => {
    const spy = vi.spyOn(api, "apiFetch");
    mockProviderLoad(spy);

    render(<SetupWizard />);

    await waitFor(() => expect(spy).toHaveBeenCalledWith("/setup/providers"));
    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("prefills the workspace from /setup/status", async () => {
    const spy = vi.spyOn(api, "apiFetch");
    mockProviderLoad(spy);

    render(<SetupWizard />);

    await waitFor(() => expect(spy).toHaveBeenCalledWith("/setup/status"));
    fireEvent.click(await screen.findByRole("button", { name: "OpenAI" }));
    expect(await screen.findByDisplayValue("/tmp/desktop-workspace")).toBeInTheDocument();
  });

  it("submits the config POST body in snake_case", async () => {
    const spy = vi.spyOn(api, "apiFetch");
    mockProviderLoad(spy);
    spy.mockResolvedValue({ ok: true, workspace: "/tmp/desktop-workspace" });

    render(<SetupWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "OpenAI" }));
    fireEvent.change(screen.getByPlaceholderText("API Key"), { target: { value: "sk-test" } });
    fireEvent.change(screen.getByPlaceholderText("模型"), { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        "/setup/config",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            provider_id: "openai",
            api_key: "sk-test",
            api_base: "",
            model: "gpt-4o",
            workspace: "/tmp/desktop-workspace",
          }),
        }),
      ),
    );
    expect(await screen.findByText(/配置完成/)).toBeInTheDocument();
  });

  it("shows the api_base input only for providers that need it", async () => {
    const spy = vi.spyOn(api, "apiFetch");
    spy
      .mockResolvedValueOnce({
        groups: [
          {
            id: "custom",
            label: "custom",
            entries: [{ id: "ollama", label: "Ollama", dialect: "openai", api_base: "", needs_api_base: true }],
          },
        ],
      })
      .mockResolvedValueOnce({ configured: false, workspace: "/tmp/ws" });

    render(<SetupWizard />);

    fireEvent.click(await screen.findByRole("button", { name: "Ollama" }));
    expect(screen.getByPlaceholderText("API Base")).toBeInTheDocument();
  });
});
