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

Register allowed peers under `a2a.remote_agents`. The model can select a peer by ID but cannot supply an arbitrary URL. Outbound network access must be allowed by `execution.network_policy`; the tool carries the `network.outbound` capability and is withheld when the policy is `deny`. Private, loopback and link-local addresses are denied by default. For a trusted internal peer, set `allow_private: true` only on that peer; DNS is still resolved, validated under the explicit exception, and pinned before every connection.

```yaml
execution:
  network_policy: restricted
a2a:
  remote_agents:
    - id: research-peer
      url: "https://agent.example.com"
      description: "Operator-configured research agent"
      # Explicitly set only for an operator-reviewed internal service:
      # allow_private: true
```

`delegate_a2a` supports `send`, `get`, and `cancel`. Sending and cancelling are side-effecting operations; querying is read-only. Configure only peers reviewed by the operator.

!!! warning "Private-network exceptions are high-trust configuration"
  `allow_private: true` permits that peer to connect to RFC1918/loopback addresses. Link-local addresses (including cloud metadata), reserved, multicast and unspecified addresses remain blocked. Use it only for operator-reviewed targets and protect configuration write access; do not make it a global default. All targets still reject non-HTTP(S) schemes, URL credentials, and redirects, and response bodies are size-limited.

## Limitations

- No streaming (`tasks/sendSubscribe` not implemented)
- No push notifications
- Only text parts processed
- Private-network targets require per-peer `allow_private: true`; restrict that setting to trusted configuration administrators
- Task retention is bounded by a TTL (3600 seconds by default) and count limit (1000 by default)
