# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-04

### Added
- Self-hosted AI agent runtime with persistent memory, skill system, and plugin architecture
- Multi-channel integrations: CLI, Gateway, Webhook, Cron, plus 14 messaging channels (Telegram, Discord, Slack, WeChat, WeCom, Feishu, DingTalk, QQ Bot, WhatsApp, Email, Matrix)
- Cognitive memory system with Working / Episodic / Semantic / Archival four tiers
- Hybrid retrieval combining BM25 + FAISS vector fusion
- A2A (Agent-to-Agent) JSON-RPC task handling with inbound task endpoints
- MCP (Model Context Protocol) client with OAuth support and dynamic tool registration
- Self-evolution engine: trajectory recording, candidate generation, eval comparison, promote/reject with cooldown and rollback
- Model routing: independent provider/model config for main reasoning, context compression, embeddings, and risk approval
- Three-level tool approval strategy: manual / smart / off; unattended channels default to denying high-risk calls
- Multi-model support: OpenAI, Anthropic, Gemini, Bedrock, OpenRouter, and DeepSeek/Qwen/Kimi/GLM/Ollama OpenAI-compatible endpoints
- Built-in web Dashboard for conversations, cost tracking, and runtime status
- Built-in cron scheduler for time-triggered Agent execution
- Output preservation: oversized tool output spilled to disk with head/tail preview and character-range retrieval via `read_spill`
- Local-first: sessions, memory, traces, and credentials stored in workspace; credentials encrypted at rest
