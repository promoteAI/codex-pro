# CLI Channel

The CLI channel provides terminal-based interaction with Codex Pro in foreground mode.

---

## Overview

The simplest interaction method. Automatically enabled in foreground mode (`codex-pro run`), no extra configuration needed.

## Configuration

```yaml
channels:
  cli:
    enabled: true
```

Enabled by default in foreground mode.

## Capabilities

| Capability | Supported |
|-----------|-----------|
| Edit messages | ❌ |
| Reactions | ❌ |
| File send | ❌ |
| Realtime | ✅ |
| Group chat | ❌ |

## Usage

```bash
# Foreground mode
codex-pro run

# Or connect to running Gateway
codex-pro cli
```

## Terminal Interaction Commands

Local commands available in CLI:

- `/help` — Show help
- `/clear` — Clear screen
- `/copy` — Copy last reply
- `/details` — Show details
- `/save` — Save conversation
- `/theme` — Toggle theme
- `/reconnect` — Reconnect after a dropped socket
- `/status` — Query authoritative server-side turn state
- `/quit` — Exit

Server commands (when connected to Gateway):

- `/approve` — Approve tool execution
- `/deny` — Deny tool execution
- `/approvals` — List pending approvals
- `/clarify` — Reply to clarification request
