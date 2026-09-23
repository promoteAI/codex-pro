import type { ThemeMode } from "../stores/settings";
import { useSettingsStore } from "../stores/settings";

const THEME_ATTR = "data-theme";

/** Resolve a preference mode to the actual theme that should render.
 *  "system" follows the OS `prefers-color-scheme`, defaulting to dark when
 *  the media query is unavailable (e.g. jsdom). */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  const mql =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: light)")
      : null;
  return mql?.matches ? "light" : "dark";
}

/** Apply a theme to <html data-theme="..."> and keep the OS-driven
 *  color-scheme in sync so native controls (scrollbars) follow suit. */
export function applyTheme(mode: ThemeMode): void {
  const theme = resolveTheme(mode);
  document.documentElement.setAttribute(THEME_ATTR, theme);
  document.documentElement.style.colorScheme = theme;
}

/** Apply the current preference once at startup. */
export function initTheme(): void {
  applyTheme(useSettingsStore.getState().prefs.theme);
}

/** Subscribe to preference changes and re-apply the theme live.
 *  For "system" mode, also re-apply whenever the OS scheme flips. Returns an
 *  unsubscribe function. */
export function watchTheme(): () => void {
  const apply = () => applyTheme(useSettingsStore.getState().prefs.theme);
  apply();

  const mql =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: light)")
      : null;
  const onSystemChange = () => {
    const mode = useSettingsStore.getState().prefs.theme;
    if (mode === "system") apply();
  };
  mql?.addEventListener?.("change", onSystemChange);

  const unsub = useSettingsStore.subscribe((state, prev) => {
    if (state.prefs.theme !== prev.prefs.theme) apply();
  });

  return () => {
    mql?.removeEventListener?.("change", onSystemChange);
    unsub();
  };
}
