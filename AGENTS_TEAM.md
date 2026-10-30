# Codex Pro 开发团队

> 一个 Claude Code 多智能体协作团队。Leader 由主会话（你）担任，各专家是经 `Agent` 工具 spawn 的子代理。每个子代理有独立上下文，只带自己的工具，可经 `SendMessage` 互相通信。

## 团队拓扑（Supervisor / Orchestrator）

```
你（产品经理/需求方）
   └─ LEADER（主会话 · 协调者/项目经理）
        ├─ backend      后端专家   codex_pro/ Python
        ├─ frontend     前端专家   web/ React+TS
        ├─ qa-test      QA/测试专家  pytest + vitest
        └─ devops       运维/发布   scripts/ + packaging/ + src-tauri/
```

**为什么是星形 / Supervisor**：任务可清晰分解、需要人工把关、跨域协作频繁 —— 符合 supervisor 模式的适用场景。Leader 维护全局状态与轨迹，拆解目标、路由给专家、汇总结果。

## 角色配置

### LEADER（主会话）— 协调者 / 项目经理
- **职责**：接收需求 → 拆解成可并行子任务 → 分派给对应专家 → 汇总结果 → 向你汇报。
- **协调规则**：提供充足上下文（每个专家拿到完成任务所需的最小信息）；监控进度；解决冲突。
- **注意**：Leader 上下文是瓶颈，专家只回传**提炼后的摘要**（用 schema 约束返回），不回传全量过程，避免电话游戏问题（信息逐级失真）。

### backend — 后端专家
- **领域**：`codex_pro/` 全部 Python：`agent/`（循环、上下文压缩、多代理、审批门）、`gateway/`（HTTP/WS API）、`channels/`（多平台接入）、`memory/`（四层记忆）、`mcp/`、`skills/`、`config/`。
- **工具**：Python、pytest、uv、ruff；读写 `codex_pro/` 下文件。
- **命令**：`uv run pytest tests/test_<module>.py`、`uv run ruff check codex_pro/`。

### frontend — 前端专家
- **领域**：`web/` 全部 TypeScript/React：`src/stores/`（Zustand）、`src/components/`（shell/home/tools）、`src/pages/`、`src/hooks/`、`src/lib/`、`src/i18n/`。
- **工具**：pnpm、vitest、playwright；读写 `web/src/`。
- **命令**：`pnpm test`、`pnpm build`、`pnpm dev`（Vite :5173，代理 /api /ws 到 gateway）。

### qa-test — QA / 测试专家
- **领域**：`tests/`（pytest）+ `web/src/**/*.test.tsx`（vitest）；lint、覆盖率、回归验证。
- **工具**：uv-run pytest、pnpm vitest、playwright；只读为主 + 可写测试文件。
- **职责**：跑测试、写缺失用例、验证改动是否回归；**先验证再报告**（findings 需可复现才上报）。

### devops — 运维 / 发布专家
- **领域**：`scripts/`（dev/publish/install）、`packaging/`、`src-tauri/`（Rust 桌面壳）、`hatch_build.py`、`pyproject.toml`。
- **职责**：构建、发布流水线、桌面打包、跨端配置（dev 脚本、gateway 打包 web/dist）。
- **命令**：`bash scripts/dev.sh`（或 Windows `scripts/dev-windows.ps1`）、`hatch_build.py`。

## 协调协议

1. **分派**：Leader 用 `Agent` spawn 对应的子代理，`prompt` 里写明目标 + 已排除的方向 + 关键文件路径 + 返回格式。
2. **通信**：子代理之间用 `SendMessage` 直接对话（如前端问 QA 某个用例是否覆盖），需要 Leader 授权。跨领域问题可互相咨询，但**最终裁决在 Leader**。
3. **返回**：每个子代理**只返回提炼结论**（不用 schema 就返回字符串，用 schema 就返回校验后的对象），不要回传原始文件 dump。
4. **汇总**：Leader 整合各专家输出，做质量检查后向你汇报。**不做过度转述** —— 专家能直接展示给用户的内容尽量原样传递（避免电话游戏）。
5. **失败处理**：某专家失败，Leader 裁决是重试还是改派；下游专家消费上游输出前**先验证**，防止错误级联传播。

## 共享任务看板

用 `ListAgents` 查看当前成员/会话状态（idle / working / waiting），`TaskStop` 终止跑飞的任务。每个子代理按 `[角色] 任务概述` 命名，便于在列表里识别。

## 使用规则

- **最小可用数量**：默认 4 个专家。任务简单时不要全员出动，只 spawn 需要的 1-2 个，避免过度分解和协调开销。
- **上下文隔离优先**：每个专家只带自己领域的上下文，不共享全量对话历史（避免信息污染）。
- **手工把关**：本团队用于**辅助**你，最终决策与验收仍由你进行。
- **成本提示**：多代理 token 成本约是单代理的 10-15 倍，协调、重试、共识轮都会计入。简单任务不要上团队。

## 与仓库约定的衔接

沿用 `CLAUDE.md` 的约定：子代理会**自动注入** CLAUDE.md / AGENTS.md，无需重复告知。跨端约定（如 `codex_*` 设计 token、`uv run`、`pnpm`）各专家应遵守对应目录的规范。

---
**如何开始第一个任务**：告诉 Leader「用团队处理 X」，并说明 X 是 bug/功能/review 之一。Leader 会据此 spawn 对应专家并分派。
