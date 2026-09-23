import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveTheme,
  applyTheme,
  initTheme,
  watchTheme,
} from "./theme";
import { useSettingsStore, DEFAULT_PREFS, type UIPreferences } from "../stores/settings";

/** jsdom lacks matchMedia; stub it so "system" resolution is deterministic. */
function stubMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return mql;
}

beforeEach(() => {
  useSettingsStore.getState().reset();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("resolveTheme 传递 light/dark", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolveTheme('system') 跟随 prefers-color-scheme", () => {
    const mql = stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("light");
    mql.matches = false;
    // matchMedia 返回的 mql 是复用的;重新 stub 为 dark。
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("dark");
  });

  it("resolveTheme('system') 在无 matchMedia 时回退 dark", () => {
    // jsdom 默认无 matchMedia;卸载 stub 后调用。
    vi.unstubAllGlobals();
    expect(typeof window.matchMedia as unknown).toBe("undefined");
    expect(resolveTheme("system")).toBe("dark");
  });

  it("applyTheme 设置 html data-theme 与 color-scheme", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("initTheme 用当前 prefs.theme 应用", () => {
    useSettingsStore.setState({
      prefs: { ...DEFAULT_PREFS, theme: "light" } as UIPreferences,
      loaded: true,
    });
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("watchTheme 应用初始主题并在 prefs.theme 变化时重应用", () => {
    useSettingsStore.setState({
      prefs: { ...DEFAULT_PREFS, theme: "dark" } as UIPreferences,
      loaded: true,
    });
    const stop = watchTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    useSettingsStore.setState({
      prefs: { ...DEFAULT_PREFS, theme: "light" } as UIPreferences,
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    stop();
    useSettingsStore.setState({
      prefs: { ...DEFAULT_PREFS, theme: "dark" } as UIPreferences,
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("watchTheme 在 system 模式下响应 OS 主题变化", () => {
    const mql = stubMatchMedia(true); // light
    useSettingsStore.setState({
      prefs: { ...DEFAULT_PREFS, theme: "system" } as UIPreferences,
      loaded: true,
    });
    const stop = watchTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // 触发 OS 切换到 dark。
    const handler = mql.addEventListener.mock.calls.find(
      (c) => c[0] === "change",
    )?.[1] as () => void;
    (matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mql,
      matches: false,
    });
    handler();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    stop();
  });
});
