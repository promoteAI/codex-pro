import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initApiBase } from "./lib/api";
import { initTheme } from "./lib/theme";
import { useSettingsStore } from "./stores/settings";
import "./index.css";
import "./i18n";

initApiBase().then(async () => {
  // Load persisted UI preferences before applying the theme — without this a
  // cold start (or a hard navigation) leaves the store on its dark default and
  // the light preference saved in the backend is never applied until the
  // settings page happens to be opened.
  await useSettingsStore.getState().loadPrefs();
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
