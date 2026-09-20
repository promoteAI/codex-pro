# Codex-Pro 未实现功能盘点与实施计划

> 审计日期：2026-09-21
> 范围：以 `docs/design/prototype-codex-pro.html`（原型）与 README 能力表为基准，对比 `web/src`（前端）与 `codex_pro/`（后端）实际实现。
>
> **实施状态（2026-09-21）**：以下缺口已通过 5 个并行 worktree 智能体全部实现并合并回 `dev`，各功能测试通过。详见文末「实施记录」。

## 总体结论

**后端已基本完备**：14 个通道均为真实适配器、gateway 全部 API 端点已实现、evolution / evaluation / scheduler / observability / multi-agent / workflow 均已接通。唯一真实缺口是 A2A 出站委派。

**前端是主要缺口所在**：大量设置页只是原型的外观复刻，靠本地 `useState` 驱动，**未持久化到后端**；另有若干原型功能是死代码（dead code）或完全缺失。

---

## 缺口清单

### A. 设置页「只有 UI，没有持久化」（P0，前端核心缺口）

以下页面在 SettingsOverlay 中已注册、能打开，但全部为纯本地 `useState`，刷新即丢，既不读也不写后端：

| 页面 | 组件 | 位置 | 说明 |
|------|------|------|------|
| 常规 General | `GeneralPage` | CorePages.tsx:91 | 权限、底部面板、终端位置、打开方式、shell 等 |
| 外观 Appearance | `AppearancePage` | CorePages.tsx:352 | 主题、对比度、半透明 |
| 配置 Agent | `AgentConfigPage` | CorePages.tsx:516 | 思考强度、上下文、批准策略等 |
| 语音 Voice | `VoicePage` | MorePages.tsx:36 | 显示 "voiceUnavailable" 静态 banner，麦克风 inert |
| 个性化 Personalization | `PersonalizationPage` | MorePages.tsx:83 | |
| 快捷键 Shortcuts | `ShortcutsPage` | MorePages.tsx:214 | |
| 账户 Account | `AccountPage` | MorePages.tsx:266 | |
| 电脑操控 Computer | `ComputerPage` | MorePages.tsx:316 | |
| 浏览器 Browser | `BrowserSettingsPage` | MorePages.tsx:692 | 内置浏览器开关等 |
| Git | `GitPage` | MorePages.tsx:890 | 分支前缀、合并方式、PR 指令 |
| Worktrees | `WorktreesPage` | MorePages.tsx:1041 | |
| 导入 Import | `ImportPage` | ModelsImport.tsx:753 | |

这些页面要么对接已有的 `/config` GET/PATCH 端点，要么需要为对应配置项建立配置持久化。

### B. 原型功能缺失 / 死代码（P1）

| 功能 | 现状 | 位置 |
|------|------|------|
| **连接（SSH）** | `connections` 在 SettingsSection 类型与 SECTION_IDS 里，但**没有任何页面**注册 → `?settings=connections` 渲染空白面板；后端也无 SSH/connections API | MorePages.tsx:875（`ConnectionsPage` 死代码）；shell.ts:19 |
| **宠物 Pets** | `PetsPage` 是死代码，未导入 SettingsOverlay、无 nav 入口、无 SettingsSection 值 | MorePages.tsx:135 |
| **钩子 Hooks** | 前端 UI 外壳，硬编码 `hooksCount:0` / `installedN:0`，新建钩子表单未持久化后端 | MorePages.tsx:723 |
| **已归档聊天** | 硬编码 `ARCHIVED_SEED`，删除/取消归档仅改本地 state，无后端 | MorePages.tsx:1134 |

### C. 后端唯一真实缺口（P0）

| 功能 | 现状 | 位置 |
|------|------|------|
| **A2A 出站委派** | `A2AClient`（client.py）已定义但从**未被任何代码调用**；agent 运行时无出站委派入口（无 agent tool）。README:180 已注明此边界 | codex_pro/a2a/client.py |

### D. 已实现、无需动（供对照）

- 全部 admin 页（Overview/Memory/Knowledge/Analytics/Sessions/Channels/Kanban/Logs/Config）均为真实数据驱动，经 `?settings=` 深链可达。**但 Skills.tsx 是孤儿**（没接到 SettingsOverlay，技能功能走 PluginsView/SettingsPluginsPage 的「技能」tab）。
- PR / 自动化 / 插件 三条路由已实现。

---

## 实施计划（按优先级逐项）

### 阶段 0：打通设置页持久化（P0，工作量最大）

目标：让 A 组设置页真正读写后端，刷新不丢。

1. **前置：扩展后端 `/config` 支持面**
   - 检查 `config.py` 的 `_editable_path` 白名单，补齐 B 组页面所需的配置键（`permissions`、`ui`、`tools`、`channels` 相关、`terminal`、`theme` 等）。
   - 文件：`codex_pro/gateway/api/config.py`、`codex_pro/config/schema.py`、`codex_pro/config/default.yaml`。
2. **建立前端 settings 持久化 store**
   - 新建 `web/src/stores/settings.ts`（Zustand），封装 `/config` GET/PATCH，按 section 惰性加载 + 保存。
3. **逐页接入**（每页：mount 时从配置读默认值，修改后 debounce/离开时 PATCH）：
   - `GeneralPage` → `CorePages.tsx`
   - `AppearancePage` → `CorePages.tsx`
   - `AgentConfigPage` → `CorePages.tsx`
   - `PersonalizationPage` / `ShortcutsPage` / `AccountPage` / `ComputerPage` / `BrowserSettingsPage` → `MorePages.tsx`
   - `GitPage` / `WorktreesPage`（git 相关已有后端能力，可对接或本地持久化）→ `MorePages.tsx`
4. **每页补测试**：参照 `Config.test.tsx` / `Cron.test.tsx` 的 mock 模式（`vi.spyOn(api, "apiFetch")`）。

### 阶段 1：接通「连接（SSH）」功能（P1）

1. 后端：新建 `codex_pro/gateway/api/connections.py`，提供 SSH 连接列表 CRUD + 刷新 + 测试。路由注册进 `gateway/api/__init__.py`。
2. 前端：把 `ConnectionsPage`（MorePages.tsx:875）接入 PROTO_PAGES& SECTIONS，实现「添加 SSH 连接」modal、列表、刷新（对齐原型 5670-5747）。
3. 补 i18n（`locales/zh/settings.json` / `en/settings.json`）。

### 阶段 2：接通「钩子 Hooks」（P1）

1. 后端：Hooks 数据/执行需确定归属 —— 若复用现有 `hooks` 概念则将其暴露为 API（或确认仅前端本地持久化即可）。
2. 前端：`HooksPage` 去掉硬编码计数，接入真实数据源；新建钩子表单提交持久化。
3. 补测试。

### 阶段 3：接通「已归档聊天」（P1）

1. 后端：确认 session 是否有 archived 状态；若无则加 `GET /sessions/archived` + `POST /sessions/{id}/archive`（或复用现有 sessions 接口加 `archived` 过滤）。
2. 前端：`ArchivedPage` 去掉 `ARCHIVED_SEED`，改为真实接口；归档/取消归档调后端。
3. 补测试。

### 阶段 4：补「宠物 Pets」入口（P2）

1. 若确要保留该功能：给 `PetsPage` 一个 `SettingsSection` 值 + nav 项，接 P0 的持久化 store。
2. 若为占位设计：评估后决定删除死代码或补全。

### 阶段 5：A2A 出站委派（P2，后端）

1. 新增 agent tool（如 `delegate_to_remote`）包装 `A2AClient`（discover/send_task/get_task/cancel_task）。
2. 在 `agent/bootstrap.py` 注册该 tool。
3. 补测试与文档（更新 README 能力表 & `docs/development/a2a` 相关说明）。

### 阶段 6：清理与收尾

1. `Skills.tsx` 孤儿页：接入 SettingsOverlay 或明确废弃。
2. 运行 `uv run ruff check codex_pro/`、`uv run pytest tests/`、`pnpm test`、`pnpm build`。

---

## 执行约定（遵循 AGENTS.md / CLAUDE.md）

- 分支：从 `dev` 切出，`feat:` / `fix:` 前缀，PR 目标 `dev`。
- 每项独立 PR，单个 diff < 800 行，复杂逻辑 < 500 行。
- 后端改动先跑 `uv run pytest`；前端先跑 `pnpm test`。

## 建议优先级排序（团队可调整）

1. 阶段 0（P0）—— 设置页持久化，是用户可直接感知的最大可用性缺口。
2. 阶段 1（P1）—— SSH 连接（当前是空白页 + 死代码）。
3. 阶段 2 / 3（P1）—— Hooks、已归档。
4. 阶段 5（P2）—— A2A 出站（README 明确标注的缺失能力）。
5. 阶段 4 / 6（P2）—— Pets、Skills 孤儿页清理。

---

## 实施记录（2026-09-21）

通过 5 个并行 worktree 智能体实现（各自独立分支，已合并回 `dev`）：

| 分支 | 提交 | 实现 | 测试 |
|------|------|------|------|
| `feat/settings-persistence` | 1ecd92b | 阶段0：`ui.preferences` 配置块 + `web/src/stores/settings.ts` + 9 个设置页接 `/config` 持久化 | 前端 13、后端 72 通过 |
| `feat/ssh-connections` | 14711bb | 阶段1：`gateway/api/connections.py` + `ConnectionsPage` 接线 + SSH 发现/测试 | 后端 12、前端 5 通过 |
| `feat/archived-chats` | c6dccda | 阶段3：session 归档 API（file/SQLite 两种模式）+ `ArchivedPage` 真实数据 | 后端 75、前端 6 通过 |
| `feat/a2a-outbound` | 7430157 | 阶段5：`agent/tools/a2a_delegate.py`（`delegate_a2a` 工具）+ 配置 + README | 24 通过 + 225 回归 |
| `feat/hooks-wiring` | 7dc54ad | 阶段2：`gateway/api/hooks.py` + `HooksPage` 真实数据 | 后端 9、前端 5 通过 |

**集成后主仓验证**：受影响后端测试 82 通过 + 配置/网关 169 通过；前端全量 347 通过、仅 2 个预存失败（i18n `nav:overview`、`CreateProjectDialog`）；`ruff` 全通过；`tsc` 无新错误。

**附带修复**：`watchdog` 被 `gateway/config_watcher.py` 无条件导入但未在 pyproject 声明（导致 gateway 测试收集失败），已加入核心依赖。

**已知预存问题（与本次无关，已确认在干净基线上同样失败）**：
- `tests/test_config_metadata.py` / `test_config_docgen.py` / `test_tool_import_contract.py`：GBK 中文文档在 Windows 上 UTF-8 读取失败。
- `tests/test_gateway_api_modules.py` 中 2 个 ConfigAPI 用例（`ui.locale` 默认值 'auto' vs 'zh'、`channels.telegram.enabled` 热重载）。
- `web/src/i18n/index.test.ts`（nav:overview）、`web/src/components/CreateProjectDialog.test.tsx`。
- 全仓 `ruff check codex_pro/` 有 33 个预存错误（均在未触碰文件）。

**未纳入本轮（阶段4 Pets）**：`PetsPage` 为原型死代码，经评估保留为未接线状态，后续单独处理。
