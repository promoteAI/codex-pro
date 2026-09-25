import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { RouteErrorBoundary } from "./ErrorBoundary";
import { CodexSidebar } from "./shell/CodexSidebar";
import { LayoutToolbar } from "./shell/LayoutToolbar";
import { SearchPalette } from "./shell/SearchPalette";
import { MobileRemoteModal } from "./MobileRemoteModal";
import { BotsModal } from "./BotsModal";
import { RemoteConnectModal } from "./RemoteConnectModal";
import { ToolsPanel } from "./tools/ToolsPanel";
import { TermPanel } from "./tools/TermPanel";
import { useShellStore } from "../stores/shell";
import { useAuthStore } from "../stores/auth";
import { useAuthRequired } from "../stores/capabilities";

const SettingsOverlay = lazy(() =>
  import("./settings/SettingsOverlay").then((m) => ({ default: m.SettingsOverlay })),
);

/**
 * Auth gate for the app shell. The `/login` route is a sibling of the Layout
 * route (not nested inside it), so the gate never blocks the login page itself.
 *
 * State machine:
 * - `authRequired === null` (capability probe in flight): wait. Returning to
 *   `/login` here would loop in open mode, and guessing "not required" would
 *   flash the dashboard on a real deployment before its first 401. Until the
 *   gateway answers we render a neutral placeholder and nothing else.
 * - `authRequired === true && !token`: the deployment authenticates and we are
 *   not signed in — send to /login.
 * - otherwise (open mode, or authenticated): render the shell.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const authRequired = useAuthRequired();
  const token = useAuthStore((s) => s.token);

  if (authRequired === null) {
    return null;
  }
  if (authRequired === true && !token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export function Layout() {
  const location = useLocation();
  const openTool = useShellStore((s) => s.openTool);
  const openTerm = useShellStore((s) => s.openTerm);
  const openSearch = useShellStore((s) => s.openSearch);
  const openSettings = useShellStore((s) => s.openSettings);

  const isHome =
    location.pathname === "/" || location.pathname.startsWith("/chat/");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Ctrl+, / ⌘, → 设置
      if (meta && !e.altKey && !e.shiftKey && e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }
      // Alt+Win+P / ⌥⌘P → 使用统计
      if (e.altKey && e.metaKey && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        openSettings("analytics");
        return;
      }
      // Windows: Alt+Ctrl+P as fallback when Win key isn't exposed to the page
      if (e.altKey && e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === "p" && !typing) {
        e.preventDefault();
        openSettings("analytics");
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        openTool("review");
      }
      if (meta && e.key === "`") {
        e.preventDefault();
        openTerm();
      }
      if (meta && e.key.toLowerCase() === "t" && !e.shiftKey) {
        if (target?.tagName === "BODY" || target?.closest?.(".app-shell")) {
          e.preventDefault();
          openTool("browser");
        }
      }
      if (meta && e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        openTool("sidechat");
      }
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTool, openTerm, openSearch, openSettings]);

  return (
    <AuthGate>
    <div className="app-shell h-screen flex flex-col bg-codex-bg text-codex-text overflow-hidden">
      <div className="flex-1 flex min-h-0 relative">
        <CodexSidebar />
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden">
          <LayoutToolbar isHome={isHome} />
          <div className="flex-1 flex min-h-0 min-w-0 relative">
            <main className="flex-1 min-w-0 flex flex-col bg-codex-bg relative overflow-hidden">
              <RouteErrorBoundary>
                <Outlet />
              </RouteErrorBoundary>
            </main>
            {isHome && <ToolsPanel />}
          </div>
          {isHome && <TermPanel />}
        </div>
        <Suspense fallback={null}>
          <SettingsOverlay />
        </Suspense>
      </div>
      <SearchPalette />
      <MobileRemoteModal />
      <BotsModal />
      <RemoteConnectModal />
    </div>
    </AuthGate>
  );
}

/** @deprecated Prefer CodexSidebar — kept for test imports that still reference Sidebar */
export { CodexSidebar as Sidebar } from "./shell/CodexSidebar";
