import { lazy, Suspense, type ReactNode, useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Routes, Route, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Layout } from "./components/Layout";
import { Toaster } from "./components/Toaster";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { useShellStore } from "./stores/shell";
import { apiFetch } from "./lib/api";
import { watchTheme } from "./lib/theme";

const HomeView = lazy(() => import("./pages/HomeView").then((m) => ({ default: m.HomeView })));
const PrView = lazy(() => import("./pages/PrView").then((m) => ({ default: m.PrView })));
const ScheduledView = lazy(() =>
  import("./pages/ScheduledView").then((m) => ({ default: m.ScheduledView })),
);
const PluginsView = lazy(() =>
  import("./pages/PluginsView").then((m) => ({ default: m.PluginsView })),
);
const LoginPage = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Skills = lazy(() => import("./pages/Skills").then((m) => ({ default: m.Skills })));
const SetupWizard = lazy(() =>
  import("./pages/SetupWizard").then((m) => ({ default: m.SetupWizard })),
);

function RouteLoading() {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-live="polite" className="text-codex-muted text-sm p-4">
      {t("loading")}
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

function NotFound() {
  const { t } = useTranslation("common");
  return (
    <div className="h-full grid place-items-center text-center">
      <div>
        <div className="text-5xl font-bold text-[#2a2a2a]">404</div>
        <p className="mt-2 text-codex-muted">{t("notFound")}</p>
        <Link to="/" className="inline-block mt-3 text-sm text-codex-accent hover:underline">
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}

function SettingsQuerySync() {
  const [params] = useSearchParams();
  const openSettings = useShellStore((s) => s.openSettings);
  useEffect(() => {
    const s = params.get("settings");
    if (s) openSettings(s as never);
  }, [params, openSettings]);
  return null;
}

interface SetupStatus {
  configured: boolean;
  workspace: string;
}

/**
 * First-run gate. On startup reads `GET /setup/status` (unauthenticated) and,
 * when the deployment has no model provider configured, redirects the user to
 * the `/setup` wizard before the main shell renders — so a fresh install lands
 * directly on setup instead of flashing an empty dashboard.
 *
 * State machine:
 * - `null` (probe in flight): render nothing so the user never sees a flash of
 *   the un-configured dashboard before the answer arrives. The probe is
 *   unauthenticated, so unlike Layout's auth gate it cannot 401.
 * - `configured === false`: `Navigate` to `/setup`.
 * - `configured === true`: render the app (the Layout route tree).
 *
 * Placed as a sibling of `/login` (not inside `<Route element={<Layout />}>`):
 * Layout's AuthGate sends `authRequired && !token` to `/login`, which would make
 * the wizard unreachable on an auth-required deployment that is also
 * unconfigured. `/setup/status` needs no token, so the gate can run before the
 * auth question is even asked — first-run wins over login.
 */
function FirstRunGate({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<SetupStatus>("/setup/status")
      .then((s) => {
        if (!cancelled) setConfigured(s.configured);
      })
      .catch(() => {
        // A failed probe must not lock the user out of the app: assume
        // configured (render the shell) and let the page's own requests be
        // authoritative. This mirrors how the capability probe degrades.
        if (!cancelled) setConfigured(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (configured === false) {
    return <Navigate to="/setup" replace />;
  }
  if (configured === null) {
    return null;
  }
  return <>{children}</>;
}

export function App() {
  useEffect(() => {
    // Live theme: re-apply whenever prefs.theme changes (e.g. on the
    // Appearance settings page) and follow the OS scheme in "system" mode.
    return watchTheme();
  }, []);

  return (
    <BrowserRouter>
      <ConfirmProvider>
        <Toaster />
        <Routes>
          <Route
            path="/login"
            element={
              <LazyRoute>
                <LoginPage />
              </LazyRoute>
            }
          />
          <Route
            path="/setup"
            element={
              <LazyRoute>
                <SetupWizard />
              </LazyRoute>
            }
          />
          <Route element={<FirstRunGate><Layout /></FirstRunGate>}>
            <Route
              index
              element={
                <LazyRoute>
                  <SettingsQuerySync />
                  <HomeView />
                </LazyRoute>
              }
            />
            <Route
              path="chat/:sessionId"
              element={
                <LazyRoute>
                  <HomeView />
                </LazyRoute>
              }
            />
            <Route
              path="prs"
              element={
                <LazyRoute>
                  <PrView />
                </LazyRoute>
              }
            />
            <Route
              path="scheduled"
              element={
                <LazyRoute>
                  <ScheduledView />
                </LazyRoute>
              }
            />
            <Route
              path="plugins"
              element={
                <LazyRoute>
                  <PluginsView />
                </LazyRoute>
              }
            />
            <Route
              path="skills"
              element={
                <LazyRoute>
                  <Skills />
                </LazyRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ConfirmProvider>
    </BrowserRouter>
  );
}
