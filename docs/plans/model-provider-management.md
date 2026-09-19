# 模型提供商管理 — 最佳完善计划

## 现状差距总结

| 维度 | 当前状态 | 目标状态 |
|------|---------|---------|
| 后端 API | 无独立 provider 端点，config PATCH 排除 models 段 | 专用 `/api/v1/providers` CRUD + 健康状态查询 |
| 前端 ModelsPage | 纯本地 state，硬编码 mock 数据 | 对接真实 API，支持增删改查 |
| 健康状态 | 后端有完整熔断器，前端零展示 | 侧栏显示状态指示灯，详情展示冷却计时 |
| 导入功能 | 按钮占位，无实现 | 从 Claude Code / Cursor / Ollama 读取配置 |
| 模型列表动态拉取 | CLI setup 有，前端无 | Provider 编辑时按 endpoint 自动刷新模型 |

---

## Phase 1：后端专用 API（预计 1-2 天）

### 1.1 新建 `gateway/api/providers.py`

```
GET    /api/v1/providers              — 列出所有 provider（key 脱敏）+ 健康快照
GET    /api/v1/providers/{name}       — 单个 provider 详情（含健康状态）
POST   /api/v1/providers              — 新增 provider（校验后追加到 config）
PUT    /api/v1/providers/{name}       — 完整替换 provider 配置
PATCH  /api/v1/providers/{name}       — 部分更新字段
DELETE /api/v1/providers/{name}       — 删除 provider
POST   /api/v1/providers/{name}/test  — 连通性测试（返回成功/失败 + 模型列表）
GET    /api/v1/providers/{name}/models — 动态拉取模型列表（复用 model_verify 逻辑）
GET    /api/v1/providers/health       — 全量健康状态快照
```

**关键点：**
- 复用 `create_provider()` 工厂做校验，不直接写 YAML
- 写操作走 `save_config()` + 广播 `config_updated`（需重启）
- GET 返回时过滤 `api_key`/`credential_pool`，保留 `api_key_env` 名

### 1.2 扩展 `gateway/api/config.py`

将 `models` 加入 `_editable_path` 白名单，同时新增 provider 专有操作路径。

### 1.3 新建 `gateway/ws_handlers/provider_events.py`

- 监听 config 变更事件，向已订阅的 WS 客户端推送 provider 列表刷新
- 推送健康状态变化（HEALTHY ↔ DEGRADED ↔ COOLDOWN）

---

## Phase 2：前端 ModelsPage 重构（预计 1-2 天）

### 2.1 新建 `web/src/stores/providers.ts`（Zustand）

```ts
interface ProviderEntry {
  name: string
  api_base: string
  models: string[]
  enabled: boolean        // 由健康状态推断
  health?: HealthStatus   // healthy | degraded | cooldown | disabled
}

interface ProvidersState {
  providers: ProviderEntry[]
  activeName: string | null
  loading: boolean
  fetchProviders: () => Promise<void>
  addProvider: (p: Partial<ProviderEntry>) => Promise<void>
  updateProvider: (name: string, patch: Partial<ProviderEntry>) => Promise<void>
  deleteProvider: (name: string) => Promise<void>
  testProvider: (name: string) => Promise<{ok: boolean; models?: string[]}>
  fetchModels: (name: string) => Promise<string[]>
}
```

### 2.2 重写 `ModelsImport.tsx` → `ModelsPage`

- 侧栏：品牌图标 + 名称 + 健康状态色点（绿/黄/灰/红）
- 详情页：Base URL、API Key（遮蔽显示）、模型列表（带 badge）
- 顶部工具栏：刷新按钮（调 `/test`）、"+" 新建 provider
- 删除按钮：二次确认

### 2.3 i18n 补充

在 `locales/zh/settings.json` 和 `locales/en/settings.json` 新增：
```json
{
  "modelsTitle": "模型与提供商",
  "modelsDesc": "管理 AI 模型提供商连接",
  "addProvider": "添加提供商",
  "testConnection": "测试连接",
  "fetchingModels": "获取模型列表...",
  "healthHealthy": "正常",
  "healthDegraded": "退化",
  "healthCooldown": "冷却中",
  "healthDisabled": "已禁用"
}
```

---

## Phase 3：导入功能实现（预计 0.5 天）

### 3.1 后端 `POST /api/v1/providers/import`

```python
# 支持源：
# - claude-code: 读取 ~/.claude/settings.json 中的 apiBaseUrl/apiKey
# - cursor:      读取应用数据目录中的 stored credentials
# - ollama:      GET http://127.0.0.1:11434/api/version
```

### 3.2 前端 ImportPage

- 点击"导入"后调 API，回填表单
- 显示检测到源的数量（灰色提示文字已有基础）

---

## Phase 4：健康状态面板（预计 0.5 天）

### 4.1 后端 `GET /api/v1/providers/health`

返回：
```json
{
  "openai":      { "status": "healthy",  "last_error": "", "failure_count": 0 },
  "anthropic":   { "status": "degraded", "last_error": "rate limit", "failure_count": 3, "cooldown_until": "2026-09-19T10:30:00Z" },
  "deepseek":    { "status": "cooldown", "cooldown_until": "..." }
}
```

### 4.2 前端集成

- ModelsPage 侧栏每个 provider 行末显示状态色点
- 悬停 tooltip 显示错误信息和冷却倒计时

---

## 优先级排序

| 优先级 | 项目 | 理由 |
|--------|------|------|
| P0 | 1.1 后端 providers API | 其他所有工作的前提 |
| P0 | 2.2 ModelsPage 对接真实数据 | 用户最直接的可用性缺口 |
| P1 | 4.1+4.2 健康状态展示 | 增强运维可见性 |
| P1 | 2.3 i18n 补全 | 中英文用户体验 |
| P2 | 3.1+3.2 导入功能 | 方便但非核心 |
| P2 | 1.3 WS 推送 | 体验增强，可后续加 |

---

## 风险提示

1. **密钥安全**：provider key 在 GET 响应中必须脱敏，只在创建/更新时明文写入
2. **重启生效**：provider 列表变更需重启才能重连 SDK 客户端，UI 需明确提示
3. **路由热更新**：当前 `ModelRouter` 在启动时一次性注册，运行时新增 provider 需重建 router（或暴露 reinit 接口）
