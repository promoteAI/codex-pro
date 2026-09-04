# Codex Pro Documentation

**Codex Pro** is a self-hosted, long-running AI Agent runtime with persistent memory, skills evolution, and multi-channel integrations.

---

## Quick Navigation

<div class="grid cards" markdown>

-   :material-rocket-launch:{ .lg .middle } **Getting Started**

    ---

    Install and have your first conversation in 5 minutes

    [:octicons-arrow-right-24: Get started](getting-started/index.en.md)

-   :material-server-network:{ .lg .middle } **Background Deployment**

    ---

    Run as a daemon or systemd service for 24/7 availability

    [:octicons-arrow-right-24: Deployment guide](operations/deployment.md)

-   :material-chat-processing:{ .lg .middle } **Platform Integrations**

    ---

    Connect your Agent to DingTalk, Feishu, WeChat, Slack, Telegram, and 14 channels total

    [:octicons-arrow-right-24: Channel configuration](integrations/channels/index.md)

-   :material-puzzle:{ .lg .middle } **Extend & Develop**

    ---

    Write custom skills, plugins, and channel adapters

    [:octicons-arrow-right-24: Developer guide](development/index.en.md)

</div>

---

## Core Capabilities

| Module | Description | Details |
|--------|-------------|---------|
| **Agent Loop** | Receive events → build context → call model → execute tools, shared across all entry points | [Agent loop](concepts/agent-loop.md) |
| **Cognitive Memory** | Working / Episodic / Semantic / Archival four tiers, with decay, contradiction detection and importance reranking | [Memory system](concepts/memory-system.md) |
| **Hybrid Retrieval** | BM25 + FAISS vector fusion, adaptive weighting per query, graceful degradation without FAISS | [Knowledge base](guides/knowledge-base.md) |
| **Self-Evolution** | Trajectory recording → candidate generation → eval comparison → promote/reject, with cooldown and rollback | [Evolution & evaluation](concepts/evolution-evaluation.md) |
| **Model Routing** | Main reasoning, context compression, embeddings and risk approval each configurable with independent provider and model | [Routing & fallback](guides/models/routing-fallback.md) |
| **Tool Approval** | Three modes: `manual` / `smart` / `off`, unattended channels default to denying high-risk calls | [Tools & permissions](guides/tools-permissions.md) |
| **Multi-model support** | OpenAI, Anthropic, Gemini, Bedrock, OpenRouter, plus OpenAI-compatible endpoints (DeepSeek, Qwen, Kimi, GLM, Ollama) | [Provider overview](guides/models/providers.md) |
| **14 channel adapters** | CLI, Cron, DingTalk, Discord, Email, Feishu, Matrix, QQ Bot, Slack, Telegram, Webhook, WeCom, WeChat, WhatsApp | [Channel setup](integrations/channels/index.md) |
| **Cross-Process Interop** | Inbound A2A JSON-RPC service + MCP client (with OAuth), with dynamic tool registration | [MCP](integrations/mcp.md) · [A2A](integrations/a2a.md) |
| **Plugin system** | Register external plugins via entry-points | [Using plugins](integrations/plugins/using-plugins.md) |
| **Codex Pro** | Built-in web UI for chat, cost, and runtime status | [Codex Pro](guides/web-ui.md) |
| **Scheduled tasks** | Built-in cron scheduler for time-triggered Agent execution | [Scheduled jobs](guides/scheduled-jobs.md) |
| **Output Preservation** | Oversized tool output is spilled to disk; the model sees a head/tail preview plus a retrieval path and can pull the full text back with `read_spill` | [Context compression & spill](concepts/context-compression-spill.md) |
| **Local-First** | Sessions, memory, traces and credentials stored in the workspace by default, credentials encrypted at rest | [Security model](concepts/security-model.md) |

---

## Project Status

!!! warning "Beta Stage"
    Codex Pro is currently at **v0.1.0** in Beta. The core API is stabilizing, but breaking changes may still occur in:

    - Configuration file format (`config.yaml` schema)
    - Plugin / skill API interfaces
    - Database schema (migration provided via `codex-pro migrate`)

    Review the [CHANGELOG](https://github.com/promoteAI/codex-pro/blob/master/CHANGELOG.md) and back up your data before upgrading.

---

## System Requirements

- Python 3.11+
- Linux / macOS / Windows (WSL2 recommended)
- At least one model API key (OpenAI, Anthropic, etc.)

---

## License

Codex Pro is open-source under the [MIT License](https://github.com/promoteAI/codex-pro/blob/master/LICENSE).
