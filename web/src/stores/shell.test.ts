import { describe, it, expect, beforeEach } from "vitest";
import { useShellStore } from "./shell";

beforeEach(() => {
  useShellStore.setState({
    toolsOpen: false,
    termOpen: false,
    settingsOpen: false,
    searchOpen: false,
    layoutMode: "side",
    activeToolPane: "hub",
    sessionTabs: [],
    activeTabId: null,
    settingsSection: "plugins",
  });
});

describe("shell store", () => {
  it("opens tools and adds a review tab", () => {
    useShellStore.getState().openTool("review");
    const s = useShellStore.getState();
    expect(s.toolsOpen).toBe(true);
    expect(s.activeToolPane).toBe("review");
    expect(s.sessionTabs).toHaveLength(1);
    expect(s.sessionTabs[0].type).toBe("review");
  });

  it("terminal tool opens bottom panel instead of duplicating side pane", () => {
    useShellStore.getState().openTool("terminal");
    expect(useShellStore.getState().termOpen).toBe(true);
  });

  it("toggles settings section", () => {
    useShellStore.getState().openSettings("memory");
    expect(useShellStore.getState().settingsOpen).toBe(true);
    expect(useShellStore.getState().settingsSection).toBe("memory");
    useShellStore.getState().closeSettings();
    expect(useShellStore.getState().settingsOpen).toBe(false);
  });

  it("closes tab and falls back to hub", () => {
    useShellStore.getState().openTool("files");
    const id = useShellStore.getState().activeTabId!;
    useShellStore.getState().closeTab(id);
    expect(useShellStore.getState().sessionTabs).toHaveLength(0);
    expect(useShellStore.getState().activeToolPane).toBe("hub");
  });
});
