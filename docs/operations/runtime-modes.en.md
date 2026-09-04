# Runtime Modes

Codex Pro offers three runtime modes for different scenarios from local development to production.

---

## Mode Comparison

| Mode | Command | Use Case | Persistence |
|------|---------|----------|-------------|
| Foreground | `codex-pro run` | Development, debugging | Process lifetime |
| Gateway | `codex-pro gateway` | Production, multi-channel | System service |
| CLI Client | `codex-pro cli` | Attach to running Gateway | N/A (thin client) |

## Foreground Mode

```bash
codex-pro run
```

Runs the agent in the current terminal. Suitable for:

- First-time setup and testing
- Development and debugging
- Single-channel usage (CLI channel only)

The process exits when the terminal closes.

## Gateway Mode

```bash
# Run in foreground
codex-pro gateway

# Install as system service
codex-pro gateway install
codex-pro gateway start
```

Gateway mode provides:

- HTTP/WebSocket API for external access
- Multi-channel support (all 14 channels)
- Codex Pro web UI
- Background service management
- A2A protocol endpoint

!!! warning "Multi-client is not multi-tenant"
    Gateway authentication provides request admission and read/admin scopes, but ordinary API tokens are not a universal user identity for every stored resource. Codex Pro and several APIs expose instance-wide state. Mutually untrusted users should use separate instances and data directories; see the [security model](../concepts/security-model.md#multi-client-tenant-boundary).

## CLI Client Mode

```bash
codex-pro cli
```

Attaches to a running local Gateway as a thin client. Native terminal
scrollback is the default; use `codex-pro cli --tui` for the full-screen UI.
The Gateway must already be running.

!!! tip
    Use `codex-pro status` to check if Gateway is running and which channels are active.
