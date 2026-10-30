import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initApiBase } from "./lib/api";
import { initTheme } from "./lib/theme";
import { useSettingsStore } from "./stores/settings";
import i18n from "./i18n";
import "./index.css";

initApiBase().then(async () => {
  // Load persisted UI preferences before applying the theme — without this a
  // cold start (or a hard navigation) leaves the store on its dark default and
  // the light preference saved in the backend is never applied until the
  // settings page happens to be opened.
  await useSettingsStore.getState().loadPrefs();
  // Non-default languages are lazy-loaded; make sure the detected language's
  // bundles are in before the first render, or the shell flashes raw keys.
  await i18n.changeLanguage(i18n.resolvedLanguage ?? "zh");
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
