export interface MockThread {
  id: string;
  title: string;
  time?: string;
  pinned?: boolean;
}

export interface MockProject {
  id: string;
  label: string;
  threads: MockThread[];
}

export const MOCK_PROJECTS: MockProject[] = [
  { id: "codex-pro", label: "codex-pro", threads: [] },
  {
    id: "eko-pro",
    label: "eko-pro",
    threads: [{ id: "arch", title: "探索并比较架构方案", time: "4天", pinned: false }],
  },
];

/** Fallback recent chats when API sessions are empty (matches Codex empty-home mock). */
export const MOCK_RECENTS: MockThread[] = [{ id: "hello", title: "你好", pinned: false }];

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

export const EFFORT_LABELS = ["低", "中", "高", "最高"] as const;

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

export interface ReviewFile {
  path: string;
  add: number;
  del: number;
}

export const MOCK_REVIEW_FILES: ReviewFile[] = [
  { path: "web/src/App.tsx", add: 12, del: 4 },
  { path: "web/src/pages/HomeView.tsx", add: 28, del: 2 },
  { path: "web/src/components/home/Composer.tsx", add: 120, del: 15 },
  { path: "uv.lock", add: 4913, del: 0 },
];

export const MOCK_FILE_PREVIEW = `import { Route } from "react-router";
import { HomeView } from "./pages/HomeView";
import { PrView } from "./pages/PrView";

export function App() {
  return (
    <>
      <Route index element={<HomeView />} />
      <Route path="prs" element={<PrView />} />
    </>
  );
}
`;

export const MOCK_BROWSER_TABS = [
  { title: "codex ···", suffix: "· Chrome", url: "https://www.google.com/search?q=codex+..." },
  { title: "如何 ···", suffix: "· Chrome", url: "https://www.google.com/search?q=%E5%A6%82%E4%BD..." },
];

export const MOCK_AGENT = {
  name: "Agnes 2.0 Flash",
  desc: "CCSwitchMulti managed worker pinned to 'agnes-2.0-flash'.",
};

export interface CtxUsageSegment {
  key: string;
  label: string;
  color: string;
  tokens: number;
  direct: number;
}

export const SLASH_COMMANDS = [
  { id: "new", label: "new", hint: "新建对话" },
  { id: "permissions", label: "permissions", hint: "批准模式" },
  { id: "model", label: "model", hint: "选择模型与推理强度" },
  { id: "effort", label: "effort", hint: "调整推理强度" },
  { id: "plan", label: "plan", hint: "开启计划模式" },
  { id: "goal", label: "goal", hint: "设置持续追求的目标" },
];
