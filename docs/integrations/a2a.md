# A2A (Agent-to-Agent)

Codex Pro 提供 A2A 入站服务，也提供 `delegate_a2a` 工具，让 Agent 向远程 A2A peer 委派文本任务。

---

## 概述

A2A 使 Agent 能通过 Agent Card 和 JSON-RPC 交换任务。入站端接收外部任务；出站端由 `delegate_a2a` 工具发现 peer、发送任务、查询状态或取消任务。

## Agent Card

通过 `GET /.well-known/agent.json` 提供 Agent 描述卡片：

```json
{
  "name": "codex-pro",
  "description": "A modular AI agent framework",
  "url": "http://localhost:58123",
  "version": "0.1.0",
  "capabilities": {"streaming": false, "pushNotifications": false},
  "skills": [{"id": "chat", "name": "chat"}, {"id": "tool_use", "name": "tool_use"}],
  "authentication": {"schemes": ["bearer"]}
}
```

## JSON-RPC 端点

`POST /a2a`

### 方法

| 方法 | 说明 |
|------|------|
| `tasks/send` | 提交任务（同步请求/响应） |
| `tasks/get` | 查询任务状态 |
| `tasks/cancel` | 取消任务 |

### 任务状态流转

```mermaid
stateDiagram-v2
    [*] --> submitted
    submitted --> working
    working --> completed
    working --> failed
    working --> canceled
    working --> input_required
    input_required --> working
```

## 配置

Gateway 运行时自动启用 A2A。通过 `a2a` 配置节进行配置。

## 身份与任务隔离

Gateway 配置多个 API token 时，每个 token 会导出一个不透明 principal。任务存储、查询、取消、在飞运行句柄和 Agent 会话都按 principal 隔离：

- 不同 token 可同时使用相同的自定义 task ID，不会相互覆盖。
- 用 token B 查询或取消 token A 的任务，与查询一个不存在的 ID 一样返回 `Task not found`，不泄露归属。
- 认证请求的内部会话键为 `a2a:{opaque_hash}`，不包含 token 或其指纹；无 token 的单主体部署为了兼容仍使用 `a2a:{task_id}`。

## 出站委派

工具通过 `a2a.remote_agents` 注册允许访问的 peer；模型只能按 ID 选择目标，不能传入任意 URL。`execution.network_policy` 必须允许出站网络；该工具带有 `network.outbound` capability，网络策略为 `deny` 时不会开放给 Agent。默认禁止私有、本机、link-local 等非公网地址。需要访问受信任的内网代理时，可仅对该 peer 显式设置 `allow_private: true`；请求仍会在每次连接前解析、校验并 pin 住 DNS 地址。

```yaml
execution:
  network_policy: restricted
a2a:
  remote_agents:
    - id: research-peer
      url: "https://agent.example.com"
      description: "受管理员配置的研究代理"
      # 仅当目标为管理员审核过的内网服务时才显式开启：
      # allow_private: true
```

`delegate_a2a` 支持 `send`、`get`、`cancel`；发送和取消是有副作用的执行操作，查询是只读操作。建议只配置运营方审核过的 peer。

!!! warning "内网例外是高信任配置"
  `allow_private: true` 会允许该 peer 连接 RFC 私网/本机地址。link-local 地址（包括云元数据）、保留地址、多播和未指定地址无论如何都会拒绝。只对管理员审核过的目标开启，并保护配置文件写权限；不要把它设为全局默认。所有目标仍拒绝非 HTTP(S) scheme、URL 凭证和重定向，并限制响应大小。

## 限制

- 不支持流式响应（`tasks/sendSubscribe` 未实现）
- 不支持推送通知
- 仅处理文本内容
- 私有网络目标仅能通过 peer 级 `allow_private: true` 显式授权；该设置必须限制在受信任的配置管理员手中
- 任务存储有 TTL（默认 3600 秒）和数量上限（默认 1000）
