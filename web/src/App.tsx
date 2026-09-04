import { lazy, Suspense, type ReactNode, useEffect } from "react";
import { BrowserRouter, Link, Navigate, Routes, Route, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Layout } from "./components/Layout";
import { Toaster } from "./components/Toaster";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { useShellStore } from "./stores/shell";

const HomeView = lazy(() => import("./pages/HomeView").then((m) => ({ default: m.HomeView })));
const PrView = lazy(() => import("./pages/PrView").then((m) => ({ default: m.PrView })));
const ScheduledView = lazy(() =>
  import("./pages/ScheduledView").then((m) => ({ default: m.ScheduledView })),
);
const PluginsView = lazy(() =>
  import("./pages/PluginsView").then((m) => ({ default: m.PluginsView })),
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

/** Opens settings overlay when landing on legacy admin URLs. */
function SettingsRedirect({ section }: { section: string }) {
  const openSettings = useShellStore((s) => s.openSettings);
  useEffect(() => {
    openSettings(section as never);
  }, [openSettings, section]);
  return <Navigate to={`/?settings=${section}`} replace />;
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

export function App() {
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <Toaster />
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route element={<Layout />}>
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

            {/* Legacy redirects */}
            <Route path="cron" element={<Navigate to="/scheduled" replace />} />
            <Route path="skills" element={<Navigate to="/plugins" replace />} />
            <Route path="sessions" element={<SettingsRedirect section="sessions" />} />
            <Route path="memory" element={<SettingsRedirect section="memory" />} />
            <Route path="knowledge" element={<SettingsRedirect section="knowledge" />} />
            <Route path="channels" element={<SettingsRedirect section="channels" />} />
            <Route path="kanban" element={<SettingsRedirect section="kanban" />} />
            <Route path="logs" element={<SettingsRedirect section="logs" />} />
            <Route path="config" element={<SettingsRedirect section="config" />} />
            <Route path="analytics" element={<SettingsRedirect section="analytics" />} />
            <Route path="overview" element={<SettingsRedirect section="overview" />} />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ConfirmProvider>
    </BrowserRouter>
  );
}
