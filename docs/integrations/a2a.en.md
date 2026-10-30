# A2A (Agent-to-Agent)

Codex Pro exposes an inbound A2A service and a `delegate_a2a` tool that lets the Agent delegate text tasks to remote A2A peers.

---

## Overview

A2A uses Agent Cards and JSON-RPC to exchange tasks. The inbound server accepts tasks from external agents; the outbound `delegate_a2a` tool discovers peers, sends tasks, checks task status, and cancels tasks.

## Agent Card

Served at `GET /.well-known/agent.json`:

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

## JSON-RPC Endpoint

`POST /a2a`

### Methods

| Method | Description |
|--------|-------------|
| `tasks/send` | Submit a task (synchronous) |
| `tasks/get` | Retrieve task status |
| `tasks/cancel` | Cancel a running task |

### Task States

```
submitted → working → completed | failed | canceled | input-required
```

## Configuration

A2A is enabled when Gateway is running. Configuration via `a2a` config section.

## Identity and task isolation

When Gateway has multiple API tokens, each token yields an opaque principal. Task storage, lookup, cancellation, in-flight run handles, and Agent sessions are all principal-scoped:

- Different tokens may use the same custom task ID without overwriting each other.
- A lookup or cancellation by token B for token A's task returns the same `Task not found` error as an ID that does not exist, so ownership is not disclosed.
- Authenticated requests use an internal `a2a:{opaque_hash}` session key containing neither the token nor its fingerprint. Single-principal, no-token deployments retain the compatible `a2a:{task_id}` form.

## Outbound delegation

Register known peers under `a2a.remote_agents`. Outbound network access must be allowed by `execution.network_policy`; the tool carries the `network.outbound` capability and is withheld when the policy is `deny`. Each peer has an `id`, `url`, and optional `description`:

```yaml
execution:
  network_policy: restricted
a2a:
  remote_agents:
    - id: research-peer
      url: "https://agent.example.com"
      description: "Operator-configured research agent"
```

`delegate_a2a` supports `send`, `get`, and `cancel`. Sending and cancelling are side-effecting operations; querying is read-only. Configure only peers reviewed by the operator.

!!! warning "Outbound URLs do not yet use shared SSRF protection"
    The current client does not validate target URLs through the shared `net_guard` at every redirect or pin DNS results. The tool also accepts a per-call `url`, not only peers registered in `remote_agents`. The network-policy capability is not URL or destination validation. Do not expose this capability to untrusted callers or treat model-generated/user-provided URLs as trusted; add an operator allowlist, SSRF validation, and DNS-rebinding protection before remote deployment.

## Limitations

- No streaming (`tasks/sendSubscribe` not implemented)
- No push notifications
- Only text parts processed
- Outbound targets do not yet receive shared SSRF validation or DNS pinning
- Task retention is bounded by a TTL (3600 seconds by default) and count limit (1000 by default)
