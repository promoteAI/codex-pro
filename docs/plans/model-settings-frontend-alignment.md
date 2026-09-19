# 模型设置页前端对齐原型 — 实现计划

## 差距分析

| 原型特性 | 当前状态 | 优先级 |
|---------|---------|--------|
| Base URL 可编辑 + 自动保存 | 只读 | P0 |
| API Key 可编辑 + 保存 | 只读 | P0 |
| API 格式下拉选择 (Chat/Responses/Anthropic) | 无 | P0 |
| Provider 启用/禁用开关 | 无 | P0 |
| 重命名按钮 | 无 | P1 |
| 模型管理：添加/删除/编辑 | 仅展示 | P0 |
| "添加模型" modal（含输入类型 chips） | 无 | P0 |
| "添加供应商" create panel（含临时模型列表） | 弹窗 | P0 |
| 侧栏品牌图标（OpenAI/Anthropic 等已知厂商） | 无 | P1 |
| 健康状态色点 | ✅ 已有 | - |

---

## Task 1：更新 ProviderConfig 数据类型（支持 editable fields）

**文件：** `web/src/stores/providers.ts`

在 `ProviderConfig` 接口中增加：
```typescript
export interface ProviderConfig {
  name: string;
  api_key: string;
  api_key_env: string;
  api_base: string;
  models: string[];          // 简化：先只存名字，不存 badges
  extra_headers: Record<string, string>;
  max_retries: number;
  timeout_seconds: number;
  stream_include_usage: boolean;
  rate_limit_rpm: number;
  // 新增：编辑态字段（前端临时状态，不存入后端）
  _editBaseUrl?: string;
  _editApiKey?: string;
  _format?: string;          // "openai" | "anthropic" | "responses"
  _enabled?: boolean;
}
```

在 store 中新增：
- `saveChanges(name: string): Promise<void>` — 用 PATCH `/providers/{name}` 更新
- `renameProvider(name: string, newName: string): Promise<void>`
- `toggleEnabled(name: string, enabled: boolean): Promise<void>`
- `addModelToProvider(name: string, modelId: string): Promise<void>`
- `removeModelFromProvider(name: string, modelId: string): Promise<void>`

---

## Task 2：新建 AddModelModal 组件

**文件：** `web/src/components/settings/pages/AddModelModal.tsx`

原型模态框包含：
- 模型 ID（文本输入，必填）
- 上下文窗口（数字输入，默认 1000000）
- 最大输出 Token（数字输入，默认 128000）
- 输入类型 chips：文本（锁定）、图片、视频、PDF（多选）
- 输出类型 chips：文本（锁定）
- 取消 / 保存按钮

Props:
```typescript
interface AddModelModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (modelId: string, contextWindow: number, inputs: string[]) => void;
}
```

---

## Task 3：重写 ModelsPage 对齐原型

**文件：** `web/src/components/settings/pages/ModelsImport.tsx`

### 布局结构调整

```
┌─────────────────────────────────────────────────────────┐
│  模型设置                            [刷新] [+ 添加供应商] │
├──────────┬──────────────────────────────────────────────┤
│  侧栏     │  详情面板                                    │
│ ─────    │                                              │
│ 智谱      │  agnes                    [✓已启用] [✏️重命名][🗑️]
│   BigModel●│  ─────────────────────────────────────────  │
│           │  Base URL   [https://apihub.../v1   ]       │
│  自定义供应商 │  API 格式   [Chat Completions ▼]          │
│   agnes  ●│  API Key    [sk-agnes-••••••••👁️ ]           │
│   hsmodel ○│                                              │
│           │  模型列表                                     │
│ [+ 添加供应商]│  agnes-2.0-flash  [视觉] [65.5K] [🔗✏️🗑️] │
└──────────┴──────────────────────────────────────────────┘
            [添加模型]
```

### 新增功能

1. **Base URL / API Key / API 格式** → 改为 editable，失焦或离开时自动保存
2. **启用/禁用切换** → 双按钮组（已启用/禁用），与原型 `ms-enable-group` 一致
3. **重命名按钮** → 点击弹出 inline input 或 modal，确认后调用 rename API
4. **模型列表** → 每行显示模型名 + badges（视觉/上下文窗口），含删除按钮
5. **添加模型按钮** → 打开 `AddModelModal`，保存后调用 store 的 `addModelToProvider`
6. **侧栏分组** → 按 api_base 域名归类（智谱 / 自定义供应商 / OpenAI / Anthropic 等）
7. **品牌图标** → 已知厂商使用 SVG 图标，其余使用默认 Box 图标

### 添加供应商流程（create panel）

点击 "+ 添加供应商" 后：
- 右侧面板切换为创建模式（非 modal）
- 表单：名称、Base URL、API Key、API 格式
- 下方有"模型列表"区域，可添加多个模型
- 底部："添加前请至少添加一个模型"提示 + "添加供应商"按钮（无模型时禁用）
- 提交后调用 `POST /providers`，并切换到详情模式

---

## Task 4：i18n 补全

**文件：** `web/src/i18n/locales/zh/settings.json` 和 `en/settings.json`

新增 key：
```json
// zh
{
  "renameProvider": "重命名",
  "renameProviderConfirm": "确定重命名供应商为 {{newName}} 吗？",
  "apiFormat": "API 格式",
  "formatChatCompletions": "Chat Completions",
  "formatResponses": "Responses",
  "formatAnthropic": "Anthropic Messages",
  "contextWindow": "上下文窗口",
  "maxOutputTokens": "最大输出 Token",
  "inputType": "输入类型",
  "outputType": "输出类型",
  "vision": "视觉",
  "image": "图片",
  "video": "视频",
  "pdf": "PDF",
  "modelId": "模型 ID",
  "addModel": "添加模型",
  "deleteModel": "删除模型",
  "openDocs": "打开文档",
  "editModel": "编辑模型",
  "modelRequired": "请至少添加一个模型",
  "providerNameRequired": "供应商名称不能为空",
  "baseUrlRequired": "Base URL 不能为空",
  "saveSuccess": "保存成功",
  "createProvider": "添加供应商",
  "createProviderSub": "配置一个完全自定义的 API 端点和初始模型"
}
```

---

## Task 5：后端 PATCH /providers/{name}（可选，若需要）

**文件：** `codex_pro/gateway/api/providers.py`

新增 `update_provider` 方法：
```python
async def update_provider(self, request: web.Request) -> web.Response:
    """PATCH 更新单个 provider 的部分字段"""
```

支持更新的字段：`api_base`, `api_key`, `models`（增删）, `max_retries`, `timeout_seconds` 等。
不更新：`name`, `api_key_env`（敏感）。

路由注册：
```python
app.router.add_patch(f"{prefix}/providers/{{name}}", providers_api.update_provider)
```

---

## 执行顺序

1. **Task 1** — 扩展 store 类型 + 新增 actions
2. **Task 4** — i18n key（先加，后续 Task 2/3 引用）
3. **Task 2** — AddModelModal 组件
4. **Task 5** — 后端 PATCH（若需要）
5. **Task 3** — 重写 ModelsPage 主体

---

## 不涉及的内容（保持现状）

- ImportPage（导入功能）— 保持原型样，不涉及 API
- 后端其他接口
- 前端其他页面
