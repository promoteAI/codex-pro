import { lazy, Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { RouteErrorBoundary } from "./ErrorBoundary";
import { CodexSidebar } from "./shell/CodexSidebar";
import { LayoutToolbar } from "./shell/LayoutToolbar";
import { SearchPalette } from "./shell/SearchPalette";
import { ToolsPanel } from "./tools/ToolsPanel";
import { TermPanel } from "./tools/TermPanel";
import { useShellStore } from "../stores/shell";

const SettingsOverlay = lazy(() =>
  import("./settings/SettingsOverlay").then((m) => ({ default: m.SettingsOverlay })),
);

export function Layout() {
  const location = useLocation();
  const openTool = useShellStore((s) => s.openTool);
  const openTerm = useShellStore((s) => s.openTerm);
  const openSearch = useShellStore((s) => s.openSearch);

  const isHome =
    location.pathname === "/" || location.pathname.startsWith("/chat/");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        openTool("review");
      }
      if (meta && e.key === "`") {
        e.preventDefault();
        openTerm();
      }
      if (meta && e.key.toLowerCase() === "t" && !e.shiftKey) {
        if ((e.target as HTMLElement)?.tagName === "BODY" || (e.target as HTMLElement)?.closest?.(".app-shell")) {
          e.preventDefault();
          openTool("browser");
        }
      }
      if (meta && e.key.toLowerCase() === "p") {
        e.preventDefault();
        openTool("files");
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
  }, [openTool, openTerm, openSearch]);

  return (
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
            <ToolsPanel />
          </div>
          <TermPanel />
        </div>
        <Suspense fallback={null}>
          <SettingsOverlay />
        </Suspense>
      </div>
      <SearchPalette />
    </div>
  );
}

/** @deprecated Prefer CodexSidebar — kept for test imports that still reference Sidebar */
export { CodexSidebar as Sidebar } from "./shell/CodexSidebar";
