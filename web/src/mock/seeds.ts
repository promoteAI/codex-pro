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

/** Context-window usage breakdown shown in the composer's context-usage dialog. */
export const MOCK_CTX_USAGE: { max: number; segments: CtxUsageSegment[] } = {
  max: 256_000,
  segments: [
    { key: "system", label: "System prompt", color: "#8a8a8a", tokens: 680, direct: 0.3 },
    { key: "tools", label: "Tool definitions", color: "#a78bfa", tokens: 12_100, direct: 4.7 },
    { key: "rules", label: "Rules", color: "#4ade80", tokens: 6_000, direct: 2.3 },
    { key: "skills", label: "Skills", color: "#fbbf24", tokens: 6_500, direct: 2.5 },
    { key: "subagents", label: "Subagent definitions", color: "#7dd3fc", tokens: 1_600, direct: 0.6 },
    { key: "conversation", label: "Conversation", color: "#9f1239", tokens: 148_800, direct: 58.1 },
  ],
};

export const SLASH_COMMANDS = [
  { id: "new", label: "new", hint: "新建对话" },
  { id: "permissions", label: "permissions", hint: "批准模式" },
  { id: "model", label: "model", hint: "选择模型与推理强度" },
  { id: "effort", label: "effort", hint: "调整推理强度" },
  { id: "plan", label: "plan", hint: "开启计划模式" },
  { id: "goal", label: "goal", hint: "设置持续追求的目标" },
];
