export const MOCK_PROJECTS = [
  { id: "codex-pro", label: "codex-pro", subtitle: "暂无聊天" },
  { id: "eko-pro", label: "eko-pro", subtitle: "探索并比较架构方案" },
];

export const MOCK_BRANCHES = [
  { id: "master", label: "master" },
  { id: "dev", label: "dev", dirty: 3 },
];

export const MOCK_MODELS = [
  "agnes-2.5-flash",
  "agnes-2.0-flash",
  "5.6 Luna",
  "5.4 Instant",
  "o3",
  "o4-mini",
];

export const EFFORT_LABELS = ["低", "中", "高", "极高"] as const;

export interface PrItem {
  id: string;
  title: string;
  meta: string;
  tabs: string[];
  body: string;
  status: "open" | "merged" | "draft";
}

export const MOCK_PRS: PrItem[] = [
  {
    id: "1",
    title: "feat: Codex shell redesign",
    meta: "codex-pro · #42 · you opened",
    tabs: ["all", "mine"],
    body: "将运维面板重构为 Codex Pro IDE 壳层，含侧栏、Composer 与工具面板。",
    status: "open",
  },
  {
    id: "2",
    title: "fix: dark theme tokens",
    meta: "codex-pro · #41 · bot",
    tabs: ["all"],
    body: "提取设计 token 并映射到 Tailwind @theme。",
    status: "open",
  },
  {
    id: "3",
    title: "chore: bundle size gate",
    meta: "codex-pro · #38 · merged",
    tabs: ["all"],
    body: "构建后检查主包体积上限。",
    status: "merged",
  },
];

export const MOCK_MARKETPLACE = [
  {
    name: "Computer Use",
    scope: "public",
    desc: "Control the desktop environment from the agent.",
  },
  {
    name: "Documents",
    scope: "public",
    desc: "Create and edit documents",
  },
  {
    name: "PDF",
    scope: "public",
    desc: "Read, create, and verify PDFs",
  },
  {
    name: "Spreadsheets",
    scope: "installed",
    desc: "Create and edit spreadsheets",
  },
];

export const MOCK_DIFF = `--- a/web/src/App.tsx
+++ b/web/src/App.tsx
@@ -1,8 +1,12 @@
-import { Overview } from "./pages/Overview";
+import { HomeView } from "./pages/HomeView";
+import { PrView } from "./pages/PrView";
 
 export function App() {
   return (
-    <Route index element={<Overview />} />
+    <Route index element={<HomeView />} />
+    <Route path="prs" element={<PrView />} />
   );
 }`;

export const MOCK_TERM_LINES = [
  "$ pnpm --filter web test",
  " ✓ src/stores/shell.test.ts (4)",
  " ✓ src/components/shell/CodexSidebar.test.tsx (2)",
  "",
  " Test Files  2 passed (2)",
  "      Tests  6 passed (6)",
];

export const MOCK_FILES = [
  { path: "web/src/App.tsx", kind: "file" as const },
  { path: "web/src/components/shell/", kind: "dir" as const },
  { path: "web/src/pages/HomeView.tsx", kind: "file" as const },
  { path: "docs/design/index.html", kind: "file" as const },
];
