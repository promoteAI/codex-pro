# Codex Pro — Agent Guidelines

This file guides AI agents working on the codex-pro codebase. Read it before making changes.

## Project Overview

codex-pro is a self-hosted, long-running AI agent runtime with:
- Multi-provider model routing (Anthropic, OpenAI, Gemini, Bedrock, OpenRouter)
- MCP (Model Context Protocol) tool integration
- Skill-based extensibility system
- Memory with tiers, retrieval, and compression
- Multi-channel integrations (Telegram, Discord, Slack, WeChat, DingTalk, etc.)
- TUI and web gateway interfaces
- Agent planning, evolution, and evaluation subsystems

## Language & Style

- Python 3.11+, async/await throughout
- `from __future__ import annotations` in every module
- Prefer type hints; avoid `Any` unless unavoidable
- Use `loguru` for logging (`logger` imported from `codex_pro.cli.i18n` is NOT a logger — use `from loguru import logger`)
- Docstrings: one-line summary + brief paragraph for public APIs
- Error strings should be user-facing; use `logger.warning` / `logger.error` for diagnostics

## Module Organization

- **`codex_pro/agent/`** — Core agent loop, tools, planning, compression, multi-agent
- **`codex_pro/cli/`** — CLI commands, TUI, rendering, service management
- **`codex_pro/gateway/`** — HTTP/WebSocket API server
- **`codex_pro/models/`** — LLM provider adapters, router, rate limiting
- **`codex_pro/memory/`** — Multi-tier memory store, retrieval, embedding
- **`codex_pro/skills/`** — Skill admission, store, review, environment
- **`codex_pro/channels/`** — Chat platform integrations
- **`codex_pro/mcp/`** — MCP client, tool adaptation, security
- **`codex_pro/evolution/`** — Agent self-evolution (candidate generation, validation, promotion)
- **`codex_pro/config/`** — YAML config loading, schema, profile defaults

Keep modules focused. If a file grows beyond ~800 lines, extract functionality into a new submodule.

## Testing

- Tests live in `tests/` mirroring the package structure
- Use pytest with `pytest-asyncio` for async tests
- Run with `uv run pytest` from the project root
- For full suite: `uv run pytest tests/`
- For a single module: `uv run pytest tests/test_<module>.py`
- Integration tests should use the fixtures in `tests/fixtures/`
- Avoid test-only functions in production code; put tests in dedicated `*_tests.py` files

## CLI Conventions

- Entry point: `codex_pro.__main__` → argument parsing → `codex_pro.app.run()`
- Commands are registered in `codex_pro.cli.*` modules
- i18n strings go through `t()` from `codex_pro.cli.i18n`
- The TUI uses Textual; CSS is in `app.tcss`
- Inline mode is `codex_pro.cli.inline`

## Config

- Config files are YAML, loaded by `codex_pro.config.loader`
- Schema is defined in `codex_pro.config.schema` — regenerate with `uv run python -m codex_pro.config.docgen` when types change
- Profiles are in `codex_pro.config.profile_defaults`
- Default config template: `codex_pro/config/default.yaml`

## Skills

- User-facing skills live in `skills/` with `SKILL.md` + optional `scripts/` and `references/`
- Internal development skills live in `.codex-pro/skills/` (see below)
- Skill store: `codex_pro.skills.store.SkillStore`
- Admission gate: `codex_pro.skills.admission.SkillAdmission`
- All SKILL.md files must have YAML frontmatter with at minimum `name` and `description`

## MCP

- MCP servers are configured in `mcp_servers` section of config
- Tool adaptation: `codex_pro.mcp.tool_adapter`
- Security: validate all tool calls through `codex_pro.mcp.security`

## Security

- All external input (commands, paths, URLs) must be validated
- Path traversal checks: `codex_pro.security.path_policy`
- Network access policy: `codex_pro.security.net_guard`
- Risk classification: `codex_pro.security.risk_classifier`
- Token budget awareness: `codex_pro.cost.budget`

## Code Review Expectations

When reviewing or making changes:
- Keep diffs under 800 lines; complex logic under 500
- Prefer small, reviewable stages over large monolithic changes
- Add integration tests for agent logic changes
- Do not add code to `codex_pro/__main__.py` or `codex_pro/app.py` without good reason — these are composition roots
- Run `uv run ruff check .` and `uv run mypy codex_pro/` before submitting

## Branch & PR Policy

- Branch off `dev`, target `dev` for PRs
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- PR description must explain _why_, not just _what_
- Link related issues

## Large Files to Watch

- `config/schema.py` (4580 LOC) — touches carefully, extract sub-schemas
- `gateway/server.py` (2463 LOC) — route handlers should be in `gateway/api/`
- `agent/loop.py` (2234 LOC) — consider extracting sub-loops into pipeline stages
- `cli/setup/__init__.py` (2194 LOC) — consider splitting by setup phase
- `cli/tui/blocks.py` (970 LOC) — extract block types into separate modules

## Reference

For patterns and conventions, see the upstream [codex](../reference/codex/) reference implementation, especially:
- `AGENTS.md` — Rust/codex-rs conventions adapted for this Python project
- `.codex-pro/skills/` — internal development skills (code-review, test-tui, path-types, etc.)
- `codex-cli/` — CLI entry patterns
