import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Prefer an explicit origin so Windows Hyper-V excluded ranges (often
  // including the default 58123) can be overridden without editing this file.
  // Example web/.env.development.local:
  //   CODEX_PRO_GATEWAY_ORIGIN=http://127.0.0.1:18789
  const env = loadEnv(mode, process.cwd(), "");
  const gatewayOrigin =
    env.CODEX_PRO_GATEWAY_ORIGIN ||
    process.env.CODEX_PRO_GATEWAY_ORIGIN ||
    "http://127.0.0.1:58123";
  const gatewayWs = gatewayOrigin.replace(/^http/i, "ws");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": gatewayOrigin,
        "/ws": {
          target: gatewayWs,
          ws: true,
        },
      },
    },
    build: {
      // Gateway-driven builds set CODEX_PRO_WEB_OUT_DIR so vite writes to
      // ``dist.staging``; the gateway then atomically swaps the staging result
      // into ``dist`` after validating it. The fallback (``dist``) keeps a
      // plain ``pnpm build`` outside the gateway writing where users expect.
      // ``emptyOutDir`` still wipes whatever was at the configured outDir the
      // moment the build starts — which is why the gateway uses staging as its
      // target rather than dist directly. See codex_pro/gateway/web_build.py.
      outDir: process.env.CODEX_PRO_WEB_OUT_DIR ?? "dist",
      emptyOutDir: true,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
