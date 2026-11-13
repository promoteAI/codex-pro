import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config for the codex-pro web UI.
 *
 * Screenshots are captured against the Vite dev server (which proxies /api and
 * /ws to the gateway). The gateway must be running for pages to render real
 * data; when it is not, pages render their empty/error states, which still
 * exercise the theme tokens and layout.
 *
 * Run with:  pnpm exec playwright test
 * Update baselines with:  pnpm exec playwright test --update-snapshots
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
