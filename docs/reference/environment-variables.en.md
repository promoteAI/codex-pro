# Environment Variables Reference

Codex Pro configuration can be overridden via environment variables. This is useful for containerized deployments, CI/CD pipelines, and secrets management.

---

## Naming Convention

All environment variables use the `CODEX_PRO_` prefix with double underscores (`__`) for nesting.

### Mapping Rules

| Config Path (YAML) | Environment Variable |
|--------------------|--------------------|
| `gateway.port` | `CODEX_PRO_GATEWAY__PORT` |
| `gateway.auth.mode` | `CODEX_PRO_GATEWAY__AUTH__MODE` |
| `models.default.api_key` | `CODEX_PRO_MODELS__DEFAULT__API_KEY` |
| `channels.telegram.token` | `CODEX_PRO_CHANNELS__TELEGRAM__TOKEN` |
| `security.profile` | `CODEX_PRO_SECURITY__PROFILE` |

### Pattern

```
CODEX_PRO_<SECTION>__<SUBSECTION>__<FIELD>
```

- All letters are **UPPERCASE**
- Single underscores within field names stay as-is
- Nesting levels are separated by **double underscore** (`__`)

!!! tip "Quick reference"
    Take the YAML dotted path, replace dots with `__`, uppercase everything, prepend `CODEX_PRO_`.

---

## Precedence

Environment variables sit in the middle of the configuration loading order:

```
Package defaults → User YAML → CODEX_PRO_ env vars → CLI overrides → Profile defaults → Validation
```

Env vars override config file values but are overridden by explicit CLI flags.

A camelCase key in YAML (`networkPolicy`) and its snake_case form
(`network_policy`) are the same setting. Every source is normalized to the
snake_case field name before merging, so an env var reliably overrides a
camelCase key written by the setup wizard or by hand. Normalization happens in
memory on load and never rewrites your config file.

---

## Type Coercion

Environment variables are always strings. Whether a value is parsed as JSON is decided by the field's declared type in the schema — never by what the value looks like. Scalars stay strings and are coerced by pydantic during validation:

| Target Type | Env Value | Result |
|-------------|-----------|--------|
| `bool` | `true`, `1`, `yes`, `on` | `True` |
| `bool` | `false`, `0`, `no`, `off` | `False` |
| `int` | `"3000"` | `3000` |
| `float` | `"0.5"` | `0.5` |
| `list` | `'["item1","item2"]'` | `["item1", "item2"]` (JSON) |
| `dict` | `'{"key": "value"}'` | `{"key": "value"}` (JSON) |
| `str` | `"hello"` | `"hello"` |
| `str` | `"false"` | `"false"` (stays a string) |

Because the decision follows the declared type, a secret or token whose value happens to read `false`, `null` or `[]` is passed through verbatim to a `str` field rather than becoming a bool/None.

```bash
export CODEX_PRO_GATEWAY__AUTH__ADMIN_TOKENS='["ephemeral-token"]'
export CODEX_PRO_TOOLS__DENY='["shell", "process"]'
export CODEX_PRO_CHANNELS__TELEGRAM__TOKEN=false   # the string "false"
```

Mapping-of-submodel fields (`tools.mcp_servers`, `gateway.platforms`) accept either a whole JSON object or a per-key override addressed as `<field>__<key>__<subfield>`:

```bash
export CODEX_PRO_TOOLS__MCP_SERVERS__MYSRV__ARGS='["-m", "myserver"]'
```

!!! warning "List syntax"
    Lists must use JSON array syntax. Comma-separated values are not split — they reach validation as a single string and fail. Malformed JSON is left as the raw string so pydantic names the offending field.

!!! note "Keys containing double underscores"
    A user-chosen key containing `__` collides with the level separator, so the path cannot be resolved and the value is treated as a string. Configure these in YAML instead.

---

## Provider Credentials

A provider API key can be written into the config, discovered from a conventional
variable name (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, ...), or read from a
variable you name yourself with `apiKeyEnv` — useful when a host process injects
an ephemeral secret and you do not want it persisted to disk:

```yaml
models:
  providers:
    - name: openai
      apiKeyEnv: MY_HOST_INJECTED_KEY
```

Resolution order is `apiKey` (explicit) > `apiKeyEnv` > the conventional variable
name for that provider. With none of them set, behaviour is unchanged: the
provider either reports a missing key or allows keyless access.

---

## Variable Reference

### Core

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CODEX_PRO_STORAGE__BASE_DIR` | str | `~/.codex-pro` | Base directory for all data |
| `CODEX_PRO_RUNTIME__WORKERS` | int | `4` | Number of async worker tasks |
| `CODEX_PRO_RUNTIME__MAX_TURNS` | int | `50` | Maximum agent turns per request |
| `CODEX_PRO_RUNTIME__TIMEOUT` | int | `300` | Request timeout in seconds |

### Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CODEX_PRO_SECURITY__PROFILE` | str | `standard` | Security profile: `minimal`, `standard`, `extended` |
| `CODEX_PRO_TOOLS__PROFILE` | str | `messaging` | Tool profile: `minimal`, `messaging`, `coding`, `full` |
| `CODEX_PRO_PERMISSIONS__REQUIRE_APPROVAL` | bool | `true` | Require approval for high-risk tools |

### Gateway
| Variable | Type | Default | Description |
|----------|------|---------|-------------|

| Config Path | Environment Variable | Type | Default |
|-------------|---------------------|------|---------|
| `security.profile` | `CODEX_PRO_SECURITY__PROFILE` | _LiteralGenericAlias | 'personal_cli' |
| `channels.telegram.enabled` | `CODEX_PRO_CHANNELS__TELEGRAM__ENABLED` | type | False |
| `channels.telegram.token` | `CODEX_PRO_CHANNELS__TELEGRAM__TOKEN` | type | '' |
| `channels.telegram.allow_from` | `CODEX_PRO_CHANNELS__TELEGRAM__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.telegram.proxy` | `CODEX_PRO_CHANNELS__TELEGRAM__PROXY` | UnionType | None |
| `channels.telegram.group_policy` | `CODEX_PRO_CHANNELS__TELEGRAM__GROUP_POLICY` | _LiteralGenericAlias | 'mention' |
| `channels.telegram.reactions_enabled` | `CODEX_PRO_CHANNELS__TELEGRAM__REACTIONS_ENABLED` | type | True |
| `channels.telegram.data_dir` | `CODEX_PRO_CHANNELS__TELEGRAM__DATA_DIR` | type | '' |
| `channels.discord.enabled` | `CODEX_PRO_CHANNELS__DISCORD__ENABLED` | type | False |
| `channels.discord.token` | `CODEX_PRO_CHANNELS__DISCORD__TOKEN` | type | '' |
| `channels.discord.allow_from` | `CODEX_PRO_CHANNELS__DISCORD__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.discord.group_policy` | `CODEX_PRO_CHANNELS__DISCORD__GROUP_POLICY` | _LiteralGenericAlias | 'mention' |
| `channels.discord.reactions_enabled` | `CODEX_PRO_CHANNELS__DISCORD__REACTIONS_ENABLED` | type | True |
| `channels.webhook.enabled` | `CODEX_PRO_CHANNELS__WEBHOOK__ENABLED` | type | False |
| `channels.webhook.host` | `CODEX_PRO_CHANNELS__WEBHOOK__HOST` | type | '0.0.0.0' |
| `channels.webhook.port` | `CODEX_PRO_CHANNELS__WEBHOOK__PORT` | type | 8080 |
| `channels.webhook.secret` | `CODEX_PRO_CHANNELS__WEBHOOK__SECRET` | type | '' |
| `channels.webhook.path` | `CODEX_PRO_CHANNELS__WEBHOOK__PATH` | type | '/webhook' |
| `channels.webhook.max_pending` | `CODEX_PRO_CHANNELS__WEBHOOK__MAX_PENDING` | type | 1000 |
| `channels.cli.enabled` | `CODEX_PRO_CHANNELS__CLI__ENABLED` | type | True |
| `channels.cron.enabled` | `CODEX_PRO_CHANNELS__CRON__ENABLED` | type | False |
| `channels.slack.enabled` | `CODEX_PRO_CHANNELS__SLACK__ENABLED` | type | False |
| `channels.slack.bot_token` | `CODEX_PRO_CHANNELS__SLACK__BOT_TOKEN` | type | '' |
| `channels.slack.app_token` | `CODEX_PRO_CHANNELS__SLACK__APP_TOKEN` | type | '' |
| `channels.slack.allow_from` | `CODEX_PRO_CHANNELS__SLACK__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.slack.reactions_enabled` | `CODEX_PRO_CHANNELS__SLACK__REACTIONS_ENABLED` | type | True |
| `channels.whatsapp.enabled` | `CODEX_PRO_CHANNELS__WHATSAPP__ENABLED` | type | False |
| `channels.whatsapp.verify_token` | `CODEX_PRO_CHANNELS__WHATSAPP__VERIFY_TOKEN` | type | '' |
| `channels.whatsapp.access_token` | `CODEX_PRO_CHANNELS__WHATSAPP__ACCESS_TOKEN` | type | '' |
| `channels.whatsapp.phone_number_id` | `CODEX_PRO_CHANNELS__WHATSAPP__PHONE_NUMBER_ID` | type | '' |
| `channels.whatsapp.webhook_path` | `CODEX_PRO_CHANNELS__WHATSAPP__WEBHOOK_PATH` | type | '/whatsapp' |
| `channels.whatsapp.host` | `CODEX_PRO_CHANNELS__WHATSAPP__HOST` | type | '0.0.0.0' |
| `channels.whatsapp.port` | `CODEX_PRO_CHANNELS__WHATSAPP__PORT` | type | 8081 |
| `channels.whatsapp.app_secret` | `CODEX_PRO_CHANNELS__WHATSAPP__APP_SECRET` | type | '' |
| `channels.whatsapp.allow_from` | `CODEX_PRO_CHANNELS__WHATSAPP__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.whatsapp.group_policy` | `CODEX_PRO_CHANNELS__WHATSAPP__GROUP_POLICY` | type | 'mention' |
| `channels.weixin.enabled` | `CODEX_PRO_CHANNELS__WEIXIN__ENABLED` | type | False |
| `channels.weixin.account_id` | `CODEX_PRO_CHANNELS__WEIXIN__ACCOUNT_ID` | type | '' |
| `channels.weixin.token` | `CODEX_PRO_CHANNELS__WEIXIN__TOKEN` | type | '' |
| `channels.weixin.base_url` | `CODEX_PRO_CHANNELS__WEIXIN__BASE_URL` | type | 'https://ilinkai.weixin.qq.com' |
| `channels.weixin.cdn_base_url` | `CODEX_PRO_CHANNELS__WEIXIN__CDN_BASE_URL` | type | 'https://novac2c.cdn.weixin.qq.com/c2c' |
| `channels.weixin.allow_from` | `CODEX_PRO_CHANNELS__WEIXIN__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.weixin.dm_policy` | `CODEX_PRO_CHANNELS__WEIXIN__DM_POLICY` | type | 'open' |
| `channels.weixin.data_dir` | `CODEX_PRO_CHANNELS__WEIXIN__DATA_DIR` | type | '' |
| `channels.weixin.typing_indicator` | `CODEX_PRO_CHANNELS__WEIXIN__TYPING_INDICATOR` | type | True |
| `channels.qqbot.enabled` | `CODEX_PRO_CHANNELS__QQBOT__ENABLED` | type | False |
| `channels.qqbot.app_id` | `CODEX_PRO_CHANNELS__QQBOT__APP_ID` | type | '' |
| `channels.qqbot.app_secret` | `CODEX_PRO_CHANNELS__QQBOT__APP_SECRET` | type | '' |
| `channels.qqbot.allow_from` | `CODEX_PRO_CHANNELS__QQBOT__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.qqbot.sandbox` | `CODEX_PRO_CHANNELS__QQBOT__SANDBOX` | type | False |
| `channels.qqbot.markdown_support` | `CODEX_PRO_CHANNELS__QQBOT__MARKDOWN_SUPPORT` | type | True |
| `channels.qqbot.media_enabled` | `CODEX_PRO_CHANNELS__QQBOT__MEDIA_ENABLED` | type | True |
| `channels.qqbot.media_max_file_size_mb` | `CODEX_PRO_CHANNELS__QQBOT__MEDIA_MAX_FILE_SIZE_MB` | type | 20 |
| `channels.qqbot.media_upload_cache_size` | `CODEX_PRO_CHANNELS__QQBOT__MEDIA_UPLOAD_CACHE_SIZE` | type | 500 |
| `channels.qqbot.media_parse_tags` | `CODEX_PRO_CHANNELS__QQBOT__MEDIA_PARSE_TAGS` | type | True |
| `channels.feishu.enabled` | `CODEX_PRO_CHANNELS__FEISHU__ENABLED` | type | False |
| `channels.feishu.app_id` | `CODEX_PRO_CHANNELS__FEISHU__APP_ID` | type | '' |
| `channels.feishu.app_secret` | `CODEX_PRO_CHANNELS__FEISHU__APP_SECRET` | type | '' |
| `channels.feishu.verification_token` | `CODEX_PRO_CHANNELS__FEISHU__VERIFICATION_TOKEN` | type | '' |
| `channels.feishu.encryption_key` | `CODEX_PRO_CHANNELS__FEISHU__ENCRYPTION_KEY` | type | '' |
| `channels.feishu.webhook_path` | `CODEX_PRO_CHANNELS__FEISHU__WEBHOOK_PATH` | type | '/feishu' |
| `channels.feishu.host` | `CODEX_PRO_CHANNELS__FEISHU__HOST` | type | '0.0.0.0' |
| `channels.feishu.port` | `CODEX_PRO_CHANNELS__FEISHU__PORT` | type | 8083 |
| `channels.feishu.group_policy` | `CODEX_PRO_CHANNELS__FEISHU__GROUP_POLICY` | type | 'mention' |
| `channels.feishu.bot_open_id` | `CODEX_PRO_CHANNELS__FEISHU__BOT_OPEN_ID` | type | '' |
| `channels.dingtalk.enabled` | `CODEX_PRO_CHANNELS__DINGTALK__ENABLED` | type | False |
| `channels.dingtalk.app_key` | `CODEX_PRO_CHANNELS__DINGTALK__APP_KEY` | type | '' |
| `channels.dingtalk.app_secret` | `CODEX_PRO_CHANNELS__DINGTALK__APP_SECRET` | type | '' |
| `channels.dingtalk.robot_code` | `CODEX_PRO_CHANNELS__DINGTALK__ROBOT_CODE` | type | '' |
| `channels.dingtalk.allow_from` | `CODEX_PRO_CHANNELS__DINGTALK__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.email.enabled` | `CODEX_PRO_CHANNELS__EMAIL__ENABLED` | type | False |
| `channels.email.imap_host` | `CODEX_PRO_CHANNELS__EMAIL__IMAP_HOST` | type | '' |
| `channels.email.imap_port` | `CODEX_PRO_CHANNELS__EMAIL__IMAP_PORT` | type | 993 |
| `channels.email.smtp_host` | `CODEX_PRO_CHANNELS__EMAIL__SMTP_HOST` | type | '' |
| `channels.email.smtp_port` | `CODEX_PRO_CHANNELS__EMAIL__SMTP_PORT` | type | 465 |
| `channels.email.username` | `CODEX_PRO_CHANNELS__EMAIL__USERNAME` | type | '' |
| `channels.email.password` | `CODEX_PRO_CHANNELS__EMAIL__PASSWORD` | type | '' |
| `channels.email.use_ssl` | `CODEX_PRO_CHANNELS__EMAIL__USE_SSL` | type | True |
| `channels.email.poll_interval_seconds` | `CODEX_PRO_CHANNELS__EMAIL__POLL_INTERVAL_SECONDS` | type | 30 |
| `channels.email.allow_from` | `CODEX_PRO_CHANNELS__EMAIL__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `channels.wecom.enabled` | `CODEX_PRO_CHANNELS__WECOM__ENABLED` | type | False |
| `channels.wecom.corp_id` | `CODEX_PRO_CHANNELS__WECOM__CORP_ID` | type | '' |
| `channels.wecom.agent_id` | `CODEX_PRO_CHANNELS__WECOM__AGENT_ID` | type | '' |
| `channels.wecom.secret` | `CODEX_PRO_CHANNELS__WECOM__SECRET` | type | '' |
| `channels.wecom.token` | `CODEX_PRO_CHANNELS__WECOM__TOKEN` | type | '' |
| `channels.wecom.encoding_aes_key` | `CODEX_PRO_CHANNELS__WECOM__ENCODING_AES_KEY` | type | '' |
| `channels.wecom.webhook_path` | `CODEX_PRO_CHANNELS__WECOM__WEBHOOK_PATH` | type | '/wecom' |
| `channels.wecom.host` | `CODEX_PRO_CHANNELS__WECOM__HOST` | type | '0.0.0.0' |
| `channels.wecom.port` | `CODEX_PRO_CHANNELS__WECOM__PORT` | type | 8084 |
| `channels.matrix.enabled` | `CODEX_PRO_CHANNELS__MATRIX__ENABLED` | type | False |
| `channels.matrix.homeserver` | `CODEX_PRO_CHANNELS__MATRIX__HOMESERVER` | type | '' |
| `channels.matrix.user_id` | `CODEX_PRO_CHANNELS__MATRIX__USER_ID` | type | '' |
| `channels.matrix.access_token` | `CODEX_PRO_CHANNELS__MATRIX__ACCESS_TOKEN` | type | '' |
| `channels.matrix.allow_rooms` | `CODEX_PRO_CHANNELS__MATRIX__ALLOW_ROOMS` | GenericAlias | PydanticUndefined |
| `channels.matrix.reactions_enabled` | `CODEX_PRO_CHANNELS__MATRIX__REACTIONS_ENABLED` | type | True |
| `channels.send_progress` | `CODEX_PRO_CHANNELS__SEND_PROGRESS` | type | True |
| `channels.send_tool_hints` | `CODEX_PRO_CHANNELS__SEND_TOOL_HINTS` | type | True |
| `channels.stream_channels` | `CODEX_PRO_CHANNELS__STREAM_CHANNELS` | GenericAlias | PydanticUndefined |
| `channels.stream_flush_chars` | `CODEX_PRO_CHANNELS__STREAM_FLUSH_CHARS` | type | 180 |
| `channels.stream_flush_interval_ms` | `CODEX_PRO_CHANNELS__STREAM_FLUSH_INTERVAL_MS` | type | 1500 |
| `channels.stream_paragraph_mode` | `CODEX_PRO_CHANNELS__STREAM_PARAGRAPH_MODE` | type | True |
| `channels.stream_local_flush_chars` | `CODEX_PRO_CHANNELS__STREAM_LOCAL_FLUSH_CHARS` | type | 24 |
| `channels.stream_local_flush_interval_ms` | `CODEX_PRO_CHANNELS__STREAM_LOCAL_FLUSH_INTERVAL_MS` | type | 100 |
| `channels.stream_local_channels` | `CODEX_PRO_CHANNELS__STREAM_LOCAL_CHANNELS` | GenericAlias | PydanticUndefined |
| `channels.stream_optimistic_channels` | `CODEX_PRO_CHANNELS__STREAM_OPTIMISTIC_CHANNELS` | GenericAlias | PydanticUndefined |
| `channels.transcription_api_key` | `CODEX_PRO_CHANNELS__TRANSCRIPTION_API_KEY` | type | '' |
| `models.default_model` | `CODEX_PRO_MODELS__DEFAULT_MODEL` | type | '' |
| `models.providers` | `CODEX_PRO_MODELS__PROVIDERS` | GenericAlias | PydanticUndefined |
| `models.routes` | `CODEX_PRO_MODELS__ROUTES` | GenericAlias | PydanticUndefined |
| `models.fallback_model` | `CODEX_PRO_MODELS__FALLBACK_MODEL` | type | '' |
| `models.model_windows` | `CODEX_PRO_MODELS__MODEL_WINDOWS` | GenericAlias | PydanticUndefined |
| `tools.profile` | `CODEX_PRO_TOOLS__PROFILE` | _LiteralGenericAlias | 'full' |
| `tools.allow` | `CODEX_PRO_TOOLS__ALLOW` | GenericAlias | PydanticUndefined |
| `tools.also_allow` | `CODEX_PRO_TOOLS__ALSO_ALLOW` | GenericAlias | PydanticUndefined |
| `tools.deny` | `CODEX_PRO_TOOLS__DENY` | GenericAlias | PydanticUndefined |
| `tools.exec.enabled` | `CODEX_PRO_TOOLS__EXEC__ENABLED` | type | True |
| `tools.exec.max_output_chars` | `CODEX_PRO_TOOLS__EXEC__MAX_OUTPUT_CHARS` | type | 2000000 |
| `tools.exec.host` | `CODEX_PRO_TOOLS__EXEC__HOST` | _LiteralGenericAlias | 'sandbox' |
| `tools.exec.security` | `CODEX_PRO_TOOLS__EXEC__SECURITY` | _LiteralGenericAlias | 'allowlist' |
| `tools.exec.ask` | `CODEX_PRO_TOOLS__EXEC__ASK` | _LiteralGenericAlias | 'on_miss' |
| `tools.exec.safe_bins` | `CODEX_PRO_TOOLS__EXEC__SAFE_BINS` | GenericAlias | PydanticUndefined |
| `tools.exec.allowed_commands` | `CODEX_PRO_TOOLS__EXEC__ALLOWED_COMMANDS` | GenericAlias | PydanticUndefined |
| `tools.exec.blocked_commands` | `CODEX_PRO_TOOLS__EXEC__BLOCKED_COMMANDS` | GenericAlias | PydanticUndefined |
| `tools.web.enabled` | `CODEX_PRO_TOOLS__WEB__ENABLED` | type | False |
| `tools.web.proxy` | `CODEX_PRO_TOOLS__WEB__PROXY` | UnionType | None |
| `tools.web.timeout_seconds` | `CODEX_PRO_TOOLS__WEB__TIMEOUT_SECONDS` | type | 30 |
| `tools.web.search_api_key` | `CODEX_PRO_TOOLS__WEB__SEARCH_API_KEY` | type | '' |
| `tools.web.search_provider` | `CODEX_PRO_TOOLS__WEB__SEARCH_PROVIDER` | _LiteralGenericAlias | 'brave' |
| `tools.web.search_api_base` | `CODEX_PRO_TOOLS__WEB__SEARCH_API_BASE` | type | '' |
| `tools.web.allow_private_addresses` | `CODEX_PRO_TOOLS__WEB__ALLOW_PRIVATE_ADDRESSES` | type | False |
| `tools.browser.enabled` | `CODEX_PRO_TOOLS__BROWSER__ENABLED` | type | True |
| `tools.browser.max_sessions` | `CODEX_PRO_TOOLS__BROWSER__MAX_SESSIONS` | type | 3 |
| `tools.browser.max_total_sessions` | `CODEX_PRO_TOOLS__BROWSER__MAX_TOTAL_SESSIONS` | type | 10 |
| `tools.browser.session_idle_timeout_sec` | `CODEX_PRO_TOOLS__BROWSER__SESSION_IDLE_TIMEOUT_SEC` | type | 300 |
| `tools.browser.max_snapshot_chars` | `CODEX_PRO_TOOLS__BROWSER__MAX_SNAPSHOT_CHARS` | type | 8000 |
| `tools.browser.headless` | `CODEX_PRO_TOOLS__BROWSER__HEADLESS` | type | True |
| `tools.browser.nav_timeout_sec` | `CODEX_PRO_TOOLS__BROWSER__NAV_TIMEOUT_SEC` | type | 30 |
| `tools.browser.allow_private_addresses` | `CODEX_PRO_TOOLS__BROWSER__ALLOW_PRIVATE_ADDRESSES` | type | False |
| `tools.browser.dialog_policy` | `CODEX_PRO_TOOLS__BROWSER__DIALOG_POLICY` | type | 'dismiss' |
| `tools.browser.allow_evaluate` | `CODEX_PRO_TOOLS__BROWSER__ALLOW_EVALUATE` | type | True |
| `tools.browser.allow_unsafe_evaluate` | `CODEX_PRO_TOOLS__BROWSER__ALLOW_UNSAFE_EVALUATE` | type | False |
| `tools.browser.persist_login_state` | `CODEX_PRO_TOOLS__BROWSER__PERSIST_LOGIN_STATE` | type | False |
| `tools.browser.viewport_width` | `CODEX_PRO_TOOLS__BROWSER__VIEWPORT_WIDTH` | type | 1280 |
| `tools.browser.viewport_height` | `CODEX_PRO_TOOLS__BROWSER__VIEWPORT_HEIGHT` | type | 800 |
| `tools.browser.user_agent` | `CODEX_PRO_TOOLS__BROWSER__USER_AGENT` | type | '' |
| `tools.restrict_to_workspace` | `CODEX_PRO_TOOLS__RESTRICT_TO_WORKSPACE` | type | False |
| `tools.safe_write_root` | `CODEX_PRO_TOOLS__SAFE_WRITE_ROOT` | type | '' |
| `tools.inbound_document_enabled` | `CODEX_PRO_TOOLS__INBOUND_DOCUMENT_ENABLED` | type | True |
| `tools.inbound_document_max_chars` | `CODEX_PRO_TOOLS__INBOUND_DOCUMENT_MAX_CHARS` | type | 8000 |
| `tools.mcp_servers` | `CODEX_PRO_TOOLS__MCP_SERVERS` | GenericAlias | PydanticUndefined |
| `tools.mcp_security_policy` | `CODEX_PRO_TOOLS__MCP_SECURITY_POLICY` | _LiteralGenericAlias | 'block' |
| `tools.image_gen.enabled` | `CODEX_PRO_TOOLS__IMAGE_GEN__ENABLED` | type | True |
| `tools.image_gen.backend` | `CODEX_PRO_TOOLS__IMAGE_GEN__BACKEND` | type | 'openai' |
| `tools.image_gen.api_key` | `CODEX_PRO_TOOLS__IMAGE_GEN__API_KEY` | type | '' |
| `tools.image_gen.api_base` | `CODEX_PRO_TOOLS__IMAGE_GEN__API_BASE` | type | '' |
| `tools.image_gen.model` | `CODEX_PRO_TOOLS__IMAGE_GEN__MODEL` | type | '' |
| `tools.image_gen.fal_key` | `CODEX_PRO_TOOLS__IMAGE_GEN__FAL_KEY` | type | '' |
| `tools.image_gen.fal_model` | `CODEX_PRO_TOOLS__IMAGE_GEN__FAL_MODEL` | type | '' |
| `tools.tts.enabled` | `CODEX_PRO_TOOLS__TTS__ENABLED` | type | True |
| `tools.tts.openai_api_key` | `CODEX_PRO_TOOLS__TTS__OPENAI_API_KEY` | type | '' |
| `tools.tts.openai_api_base` | `CODEX_PRO_TOOLS__TTS__OPENAI_API_BASE` | type | '' |
| `tools.tts.model` | `CODEX_PRO_TOOLS__TTS__MODEL` | type | '' |
| `tools.tts.default_backend` | `CODEX_PRO_TOOLS__TTS__DEFAULT_BACKEND` | type | 'edge' |
| `tools.tts.default_voice` | `CODEX_PRO_TOOLS__TTS__DEFAULT_VOICE` | type | '' |
| `tools.code_exec.enabled` | `CODEX_PRO_TOOLS__CODE_EXEC__ENABLED` | type | True |
| `tools.code_exec.timeout_seconds` | `CODEX_PRO_TOOLS__CODE_EXEC__TIMEOUT_SECONDS` | type | 30 |
| `tools.code_exec.allowed_languages` | `CODEX_PRO_TOOLS__CODE_EXEC__ALLOWED_LANGUAGES` | GenericAlias | PydanticUndefined |
| `tools.mcp.enabled` | `CODEX_PRO_TOOLS__MCP__ENABLED` | type | True |
| `execution.default_executor` | `CODEX_PRO_EXECUTION__DEFAULT_EXECUTOR` | _LiteralGenericAlias | 'sandbox' |
| `execution.sandbox_root` | `CODEX_PRO_EXECUTION__SANDBOX_ROOT` | type | '/tmp/codex-pro-sandbox' |
| `execution.container_image` | `CODEX_PRO_EXECUTION__CONTAINER_IMAGE` | type | '' |
| `execution.remote_host` | `CODEX_PRO_EXECUTION__REMOTE_HOST` | type | '' |
| `execution.remote_user` | `CODEX_PRO_EXECUTION__REMOTE_USER` | type | 'root' |
| `execution.remote_key_path` | `CODEX_PRO_EXECUTION__REMOTE_KEY_PATH` | type | '' |
| `execution.remote_strict_host_key` | `CODEX_PRO_EXECUTION__REMOTE_STRICT_HOST_KEY` | _LiteralGenericAlias | 'accept-new' |
| `execution.remote_connect_timeout` | `CODEX_PRO_EXECUTION__REMOTE_CONNECT_TIMEOUT` | type | 10 |
| `execution.network_policy` | `CODEX_PRO_EXECUTION__NETWORK_POLICY` | _LiteralGenericAlias | 'deny' |
| `execution.max_background_tasks` | `CODEX_PRO_EXECUTION__MAX_BACKGROUND_TASKS` | type | 64 |
| `permissions.admin_users` | `CODEX_PRO_PERMISSIONS__ADMIN_USERS` | GenericAlias | PydanticUndefined |
| `permissions.approval.require_approval` | `CODEX_PRO_PERMISSIONS__APPROVAL__REQUIRE_APPROVAL` | GenericAlias | PydanticUndefined |
| `permissions.approval.auto_approve` | `CODEX_PRO_PERMISSIONS__APPROVAL__AUTO_APPROVE` | GenericAlias | PydanticUndefined |
| `permissions.approval.auto_deny` | `CODEX_PRO_PERMISSIONS__APPROVAL__AUTO_DENY` | GenericAlias | PydanticUndefined |
| `permissions.approval.default_policy` | `CODEX_PRO_PERMISSIONS__APPROVAL__DEFAULT_POLICY` | _LiteralGenericAlias | 'approve' |
| `permissions.approval.wait_timeout_seconds` | `CODEX_PRO_PERMISSIONS__APPROVAL__WAIT_TIMEOUT_SECONDS` | type | 300 |
| `permissions.approval.cli_auto_approve` | `CODEX_PRO_PERMISSIONS__APPROVAL__CLI_AUTO_APPROVE` | type | True |
| `permissions.approval.trusted_channels` | `CODEX_PRO_PERMISSIONS__APPROVAL__TRUSTED_CHANNELS` | GenericAlias | PydanticUndefined |
| `permissions.approval.mode` | `CODEX_PRO_PERMISSIONS__APPROVAL__MODE` | _LiteralGenericAlias | 'smart' |
| `permissions.approval.smart_model` | `CODEX_PRO_PERMISSIONS__APPROVAL__SMART_MODEL` | type | '' |
| `permissions.approval.unattended_policy` | `CODEX_PRO_PERMISSIONS__APPROVAL__UNATTENDED_POLICY` | _LiteralGenericAlias | 'deny' |
| `permissions.elevated.enabled` | `CODEX_PRO_PERMISSIONS__ELEVATED__ENABLED` | type | False |
| `permissions.elevated.allow_from` | `CODEX_PRO_PERMISSIONS__ELEVATED__ALLOW_FROM` | GenericAlias | PydanticUndefined |
| `credentials.encryption_key_env` | `CODEX_PRO_CREDENTIALS__ENCRYPTION_KEY_ENV` | type | 'CODEX_PRO_CREDENTIAL_KEY' |
| `credentials.require_encryption` | `CODEX_PRO_CREDENTIALS__REQUIRE_ENCRYPTION` | type | True |
| `session.max_history_messages` | `CODEX_PRO_SESSION__MAX_HISTORY_MESSAGES` | type | 500 |
| `session.expiry_hours` | `CODEX_PRO_SESSION__EXPIRY_HOURS` | type | 72 |
| `session.context_window_tokens` | `CODEX_PRO_SESSION__CONTEXT_WINDOW_TOKENS` | type | 0 |
| `session.compression_window_cap` | `CODEX_PRO_SESSION__COMPRESSION_WINDOW_CAP` | type | 200000 |
| `session.introduction_enabled` | `CODEX_PRO_SESSION__INTRODUCTION_ENABLED` | type | True |
| `session.im_clarify_pending_ttl_seconds` | `CODEX_PRO_SESSION__IM_CLARIFY_PENDING_TTL_SECONDS` | type | 300 |
| `session.introduction_template` | `CODEX_PRO_SESSION__INTRODUCTION_TEMPLATE` | type | '' |
| `session.history_image_ttl_minutes` | `CODEX_PRO_SESSION__HISTORY_IMAGE_TTL_MINUTES` | type | 30 |
| `session.history_image_limit` | `CODEX_PRO_SESSION__HISTORY_IMAGE_LIMIT` | type | 4 |
| `session.history_image_skip_if_current` | `CODEX_PRO_SESSION__HISTORY_IMAGE_SKIP_IF_CURRENT` | type | True |
| `session.group_session_scope` | `CODEX_PRO_SESSION__GROUP_SESSION_SCOPE` | _LiteralGenericAlias | 'per_user' |
| `memory.enabled` | `CODEX_PRO_MEMORY__ENABLED` | type | True |
| `memory.scope_policy` | `CODEX_PRO_MEMORY__SCOPE_POLICY` | _LiteralGenericAlias | 'session' |
| `memory.cross_channel_owner` | `CODEX_PRO_MEMORY__CROSS_CHANNEL_OWNER` | type | True |
| `memory.owner_key` | `CODEX_PRO_MEMORY__OWNER_KEY` | type | 'owner' |
| `memory.allow_model_environment_writes` | `CODEX_PRO_MEMORY__ALLOW_MODEL_ENVIRONMENT_WRITES` | type | False |
| `memory.principal_bindings` | `CODEX_PRO_MEMORY__PRINCIPAL_BINDINGS` | GenericAlias | PydanticUndefined |
| `memory.retrieval_on_miss` | `CODEX_PRO_MEMORY__RETRIEVAL_ON_MISS` | _LiteralGenericAlias | 'degrade' |
| `memory.retrieval_miss_timeout_seconds` | `CODEX_PRO_MEMORY__RETRIEVAL_MISS_TIMEOUT_SECONDS` | type | 0.8 |
| `memory.cache_ttl_seconds` | `CODEX_PRO_MEMORY__CACHE_TTL_SECONDS` | type | 60.0 |
| `memory.cache_jaccard_min` | `CODEX_PRO_MEMORY__CACHE_JACCARD_MIN` | type | 0.3 |
| `memory.consolidation_threshold` | `CODEX_PRO_MEMORY__CONSOLIDATION_THRESHOLD` | type | 20 |
| `memory.narrative_episode_count` | `CODEX_PRO_MEMORY__NARRATIVE_EPISODE_COUNT` | type | 3 |
| `memory.vector_enabled` | `CODEX_PRO_MEMORY__VECTOR_ENABLED` | type | True |
| `memory.vector_dimensions` | `CODEX_PRO_MEMORY__VECTOR_DIMENSIONS` | type | 0 |
| `memory.max_user_memories` | `CODEX_PRO_MEMORY__MAX_USER_MEMORIES` | type | 1000 |
| `memory.max_env_memories` | `CODEX_PRO_MEMORY__MAX_ENV_MEMORIES` | type | 500 |
| `memory.memory_nudge_interval` | `CODEX_PRO_MEMORY__MEMORY_NUDGE_INTERVAL` | type | 10 |
| `memory.importance_decay_days` | `CODEX_PRO_MEMORY__IMPORTANCE_DECAY_DAYS` | type | 30.0 |
| `memory.snapshot_enabled` | `CODEX_PRO_MEMORY__SNAPSHOT_ENABLED` | type | True |
| `memory.snapshot_layering` | `CODEX_PRO_MEMORY__SNAPSHOT_LAYERING` | type | True |
| `memory.snapshot_user_core_max` | `CODEX_PRO_MEMORY__SNAPSHOT_USER_CORE_MAX` | type | 12 |
| `memory.snapshot_env_core_max` | `CODEX_PRO_MEMORY__SNAPSHOT_ENV_CORE_MAX` | type | 8 |
| `memory.contradiction_detection` | `CODEX_PRO_MEMORY__CONTRADICTION_DETECTION` | type | True |
| `memory.sleep_consolidation` | `CODEX_PRO_MEMORY__SLEEP_CONSOLIDATION` | type | True |
| `memory.archival_threshold` | `CODEX_PRO_MEMORY__ARCHIVAL_THRESHOLD` | type | 0.05 |
| `memory.forget_threshold` | `CODEX_PRO_MEMORY__FORGET_THRESHOLD` | type | 0.01 |
| `memory.lineage_max_versions` | `CODEX_PRO_MEMORY__LINEAGE_MAX_VERSIONS` | type | 3 |
| `memory.lineage_retention_days` | `CODEX_PRO_MEMORY__LINEAGE_RETENTION_DAYS` | type | 90 |
| `memory.max_working_memory` | `CODEX_PRO_MEMORY__MAX_WORKING_MEMORY` | type | 20 |
| `memory.embedding_backend` | `CODEX_PRO_MEMORY__EMBEDDING_BACKEND` | _LiteralGenericAlias | 'auto' |
| `memory.embedding_model` | `CODEX_PRO_MEMORY__EMBEDDING_MODEL` | type | '' |
| `memory.local_embedding_model` | `CODEX_PRO_MEMORY__LOCAL_EMBEDDING_MODEL` | type | '' |
| `memory.hf_embedding_endpoint` | `CODEX_PRO_MEMORY__HF_EMBEDDING_ENDPOINT` | type | 'https://hf-mirror.com' |
| `memory.embed_timeout_seconds` | `CODEX_PRO_MEMORY__EMBED_TIMEOUT_SECONDS` | type | 1.5 |
| `memory.rrf_min_similarity` | `CODEX_PRO_MEMORY__RRF_MIN_SIMILARITY` | type | 0.3 |
| `memory.rerank_enabled` | `CODEX_PRO_MEMORY__RERANK_ENABLED` | type | False |
| `memory.rerank_model` | `CODEX_PRO_MEMORY__RERANK_MODEL` | type | 'BAAI/bge-reranker-base' |
| `memory.rerank_top_k` | `CODEX_PRO_MEMORY__RERANK_TOP_K` | type | 10 |
| `memory.rerank_min_score` | `CODEX_PRO_MEMORY__RERANK_MIN_SCORE` | type | 0.0 |
| `memory.rerank_timeout_seconds` | `CODEX_PRO_MEMORY__RERANK_TIMEOUT_SECONDS` | type | 5.0 |
| `memory.rerank_load_timeout_seconds` | `CODEX_PRO_MEMORY__RERANK_LOAD_TIMEOUT_SECONDS` | type | 60.0 |
| `memory.embed_load_timeout_seconds` | `CODEX_PRO_MEMORY__EMBED_LOAD_TIMEOUT_SECONDS` | type | 60.0 |
| `memory.local_embedding_cache_dir` | `CODEX_PRO_MEMORY__LOCAL_EMBEDDING_CACHE_DIR` | type | '~/.codex-pro/models/fastembed' |
| `memory.local_embedding_max_load_attempts` | `CODEX_PRO_MEMORY__LOCAL_EMBEDDING_MAX_LOAD_ATTEMPTS` | type | 5 |
| `memory.local_embedding_retry_backoff_seconds` | `CODEX_PRO_MEMORY__LOCAL_EMBEDDING_RETRY_BACKOFF_SECONDS` | type | 30.0 |
| `memory.contradiction_scan_on_store` | `CODEX_PRO_MEMORY__CONTRADICTION_SCAN_ON_STORE` | type | False |
| `memory.auto_resolve_contradictions` | `CODEX_PRO_MEMORY__AUTO_RESOLVE_CONTRADICTIONS` | type | False |
| `memory.reflection_enabled` | `CODEX_PRO_MEMORY__REFLECTION_ENABLED` | type | True |
| `knowledge.enabled` | `CODEX_PRO_KNOWLEDGE__ENABLED` | type | True |
| `knowledge.docs_dir` | `CODEX_PRO_KNOWLEDGE__DOCS_DIR` | type | 'data/knowledge' |
| `knowledge.index_path` | `CODEX_PRO_KNOWLEDGE__INDEX_PATH` | type | 'data/knowledge_index.json' |
| `knowledge.auto_index` | `CODEX_PRO_KNOWLEDGE__AUTO_INDEX` | type | True |
| `knowledge.chunk_size` | `CODEX_PRO_KNOWLEDGE__CHUNK_SIZE` | type | 1200 |
| `knowledge.chunk_overlap` | `CODEX_PRO_KNOWLEDGE__CHUNK_OVERLAP` | type | 120 |
| `knowledge.max_results` | `CODEX_PRO_KNOWLEDGE__MAX_RESULTS` | type | 5 |
| `knowledge.allowed_extensions` | `CODEX_PRO_KNOWLEDGE__ALLOWED_EXTENSIONS` | GenericAlias | PydanticUndefined |
| `multi_agent.enabled` | `CODEX_PRO_MULTI_AGENT__ENABLED` | type | True |
| `multi_agent.max_depth` | `CODEX_PRO_MULTI_AGENT__MAX_DEPTH` | type | 3 |
| `multi_agent.max_parallel_workers` | `CODEX_PRO_MULTI_AGENT__MAX_PARALLEL_WORKERS` | type | 4 |
| `multi_agent.max_iterations` | `CODEX_PRO_MULTI_AGENT__MAX_ITERATIONS` | type | 12 |
| `multi_agent.audit_path` | `CODEX_PRO_MULTI_AGENT__AUDIT_PATH` | type | 'data/delegation_audit.jsonl' |
| `multi_agent.worker_profiles` | `CODEX_PRO_MULTI_AGENT__WORKER_PROFILES` | GenericAlias | PydanticUndefined |
| `scheduler.enabled` | `CODEX_PRO_SCHEDULER__ENABLED` | type | True |
| `scheduler.max_concurrent_jobs` | `CODEX_PRO_SCHEDULER__MAX_CONCURRENT_JOBS` | type | 10 |
| `checkpoint.enabled` | `CODEX_PRO_CHECKPOINT__ENABLED` | type | True |
| `checkpoint.store_path` | `CODEX_PRO_CHECKPOINT__STORE_PATH` | type | '~/.codex-pro/checkpoints/store' |
| `checkpoint.max_snapshots_per_workspace` | `CODEX_PRO_CHECKPOINT__MAX_SNAPSHOTS_PER_WORKSPACE` | type | 20 |
| `checkpoint.max_total_size_mb` | `CODEX_PRO_CHECKPOINT__MAX_TOTAL_SIZE_MB` | type | 500 |
| `checkpoint.max_file_size_mb` | `CODEX_PRO_CHECKPOINT__MAX_FILE_SIZE_MB` | type | 10 |
| `validation.enabled` | `CODEX_PRO_VALIDATION__ENABLED` | type | True |
| `validation.timeout_sec` | `CODEX_PRO_VALIDATION__TIMEOUT_SEC` | type | 5.0 |
| `validation.max_diagnostics` | `CODEX_PRO_VALIDATION__MAX_DIAGNOSTICS` | type | 10 |
| `validation.max_file_size_kb` | `CODEX_PRO_VALIDATION__MAX_FILE_SIZE_KB` | type | 512 |
| `media_understanding.audio_enabled` | `CODEX_PRO_MEDIA_UNDERSTANDING__AUDIO_ENABLED` | type | True |
| `media_understanding.audio_provider` | `CODEX_PRO_MEDIA_UNDERSTANDING__AUDIO_PROVIDER` | type | 'auto' |
| `media_understanding.min_audio_size_kb` | `CODEX_PRO_MEDIA_UNDERSTANDING__MIN_AUDIO_SIZE_KB` | type | 1.0 |
| `media_understanding.max_audio_size_kb` | `CODEX_PRO_MEDIA_UNDERSTANDING__MAX_AUDIO_SIZE_KB` | type | 25000 |
| `media_understanding.local_model_size` | `CODEX_PRO_MEDIA_UNDERSTANDING__LOCAL_MODEL_SIZE` | type | 'base' |
| `media_understanding.video_enabled` | `CODEX_PRO_MEDIA_UNDERSTANDING__VIDEO_ENABLED` | type | True |
| `media_understanding.video_frame_count` | `CODEX_PRO_MEDIA_UNDERSTANDING__VIDEO_FRAME_COUNT` | type | 4 |
| `media_understanding.video_vision_model` | `CODEX_PRO_MEDIA_UNDERSTANDING__VIDEO_VISION_MODEL` | type | '' |
| `media_understanding.video_vision_prompt` | `CODEX_PRO_MEDIA_UNDERSTANDING__VIDEO_VISION_PROMPT` | type | '简要描述这段视频的画面内容。' |
| `media_understanding.min_video_size_kb` | `CODEX_PRO_MEDIA_UNDERSTANDING__MIN_VIDEO_SIZE_KB` | type | 1.0 |
| `media_understanding.max_video_size_kb` | `CODEX_PRO_MEDIA_UNDERSTANDING__MAX_VIDEO_SIZE_KB` | type | 204800 |
| `media_understanding.video_ffmpeg_concurrency` | `CODEX_PRO_MEDIA_UNDERSTANDING__VIDEO_FFMPEG_CONCURRENCY` | type | 2 |
| `media_understanding.transcription_base_url` | `CODEX_PRO_MEDIA_UNDERSTANDING__TRANSCRIPTION_BASE_URL` | type | 'https://api.groq.com/openai/v1' |
| `media_understanding.transcription_model` | `CODEX_PRO_MEDIA_UNDERSTANDING__TRANSCRIPTION_MODEL` | type | 'whisper-large-v3' |
| `runtime.single_instance` | `CODEX_PRO_RUNTIME__SINGLE_INSTANCE` | type | True |
| `storage.database_path` | `CODEX_PRO_STORAGE__DATABASE_PATH` | type | 'data/codex_pro.db' |
| `storage.sessions_dir` | `CODEX_PRO_STORAGE__SESSIONS_DIR` | type | 'data/sessions' |
| `storage.memory_dir` | `CODEX_PRO_STORAGE__MEMORY_DIR` | type | 'data/memory' |
| `storage.logs_dir` | `CODEX_PRO_STORAGE__LOGS_DIR` | type | 'data/logs' |
| `storage.spill_dir` | `CODEX_PRO_STORAGE__SPILL_DIR` | type | 'data/spill' |
| `spill.enabled` | `CODEX_PRO_SPILL__ENABLED` | type | True |
| `spill.max_inline_chars` | `CODEX_PRO_SPILL__MAX_INLINE_CHARS` | type | 6000 |
| `spill.retention_days` | `CODEX_PRO_SPILL__RETENTION_DAYS` | type | 7 |
| `spill.max_total_mb` | `CODEX_PRO_SPILL__MAX_TOTAL_MB` | type | 512 |
| `spill.sweep_interval_hours` | `CODEX_PRO_SPILL__SWEEP_INTERVAL_HOURS` | type | 6 |
| `observability.log_level` | `CODEX_PRO_OBSERVABILITY__LOG_LEVEL` | type | 'INFO' |
| `observability.trace_enabled` | `CODEX_PRO_OBSERVABILITY__TRACE_ENABLED` | type | True |
| `observability.max_trace_files` | `CODEX_PRO_OBSERVABILITY__MAX_TRACE_FILES` | type | 500 |
| `observability.health_check_interval_seconds` | `CODEX_PRO_OBSERVABILITY__HEALTH_CHECK_INTERVAL_SECONDS` | type | 60 |
| `observability.otel_enabled` | `CODEX_PRO_OBSERVABILITY__OTEL_ENABLED` | type | True |
| `observability.otel_endpoint` | `CODEX_PRO_OBSERVABILITY__OTEL_ENDPOINT` | type | '' |
| `observability.otel_service_name` | `CODEX_PRO_OBSERVABILITY__OTEL_SERVICE_NAME` | type | 'codex-pro' |
| `observability.otel_export_interval_ms` | `CODEX_PRO_OBSERVABILITY__OTEL_EXPORT_INTERVAL_MS` | type | 5000 |
| `observability.loop_watchdog_enabled` | `CODEX_PRO_OBSERVABILITY__LOOP_WATCHDOG_ENABLED` | type | True |
| `observability.loop_watchdog_warn_seconds` | `CODEX_PRO_OBSERVABILITY__LOOP_WATCHDOG_WARN_SECONDS` | type | 5.0 |
| `observability.loop_watchdog_kill_seconds` | `CODEX_PRO_OBSERVABILITY__LOOP_WATCHDOG_KILL_SECONDS` | type | 30.0 |
| `observability.loop_watchdog_check_interval_seconds` | `CODEX_PRO_OBSERVABILITY__LOOP_WATCHDOG_CHECK_INTERVAL_SECONDS` | type | 5.0 |
| `observability.loop_watchdog_max_restarts_per_hour` | `CODEX_PRO_OBSERVABILITY__LOOP_WATCHDOG_MAX_RESTARTS_PER_HOUR` | type | 5 |
| `skills.enabled` | `CODEX_PRO_SKILLS__ENABLED` | type | True |
| `skills.skills_dir` | `CODEX_PRO_SKILLS__SKILLS_DIR` | type | 'skills' |
| `skills.creation_nudge_interval` | `CODEX_PRO_SKILLS__CREATION_NUDGE_INTERVAL` | type | 10 |
| `skills.disabled` | `CODEX_PRO_SKILLS__DISABLED` | GenericAlias | PydanticUndefined |
| `skills.external_dirs` | `CODEX_PRO_SKILLS__EXTERNAL_DIRS` | GenericAlias | PydanticUndefined |
| `skills.allow_lazy_installs` | `CODEX_PRO_SKILLS__ALLOW_LAZY_INSTALLS` | type | True |
| `skills.admission_policy` | `CODEX_PRO_SKILLS__ADMISSION_POLICY` | _LiteralGenericAlias | 'stage_for_review' |
| `skills.auto_write_risk` | `CODEX_PRO_SKILLS__AUTO_WRITE_RISK` | _LiteralGenericAlias | 'low' |
| `compression.enabled` | `CODEX_PRO_COMPRESSION__ENABLED` | type | True |
| `compression.trigger_ratio` | `CODEX_PRO_COMPRESSION__TRIGGER_RATIO` | type | 0.7 |
| `compression.tail_budget_ratio` | `CODEX_PRO_COMPRESSION__TAIL_BUDGET_RATIO` | type | 0.4 |
| `compression.head_protect_count` | `CODEX_PRO_COMPRESSION__HEAD_PROTECT_COUNT` | type | 3 |
| `compression.summary_target_ratio` | `CODEX_PRO_COMPRESSION__SUMMARY_TARGET_RATIO` | type | 0.2 |
| `compression.summary_min_tokens` | `CODEX_PRO_COMPRESSION__SUMMARY_MIN_TOKENS` | type | 2000 |
| `compression.summary_max_tokens` | `CODEX_PRO_COMPRESSION__SUMMARY_MAX_TOKENS` | type | 12000 |
| `compression.summary_model` | `CODEX_PRO_COMPRESSION__SUMMARY_MODEL` | type | '' |
| `compression.summary_cooldown_seconds` | `CODEX_PRO_COMPRESSION__SUMMARY_COOLDOWN_SECONDS` | type | 600 |
| `compression.tool_pruning_enabled` | `CODEX_PRO_COMPRESSION__TOOL_PRUNING_ENABLED` | type | True |
| `compression.tool_pruning_tail_budget_ratio` | `CODEX_PRO_COMPRESSION__TOOL_PRUNING_TAIL_BUDGET_RATIO` | type | 0.3 |
| `compression.max_compression_count` | `CODEX_PRO_COMPRESSION__MAX_COMPRESSION_COUNT` | type | 10 |
| `gateway.enabled` | `CODEX_PRO_GATEWAY__ENABLED` | type | False |
| `gateway.host` | `CODEX_PRO_GATEWAY__HOST` | type | '127.0.0.1' |
| `gateway.port` | `CODEX_PRO_GATEWAY__PORT` | type | 58123 |
| `gateway.api_prefix` | `CODEX_PRO_GATEWAY__API_PREFIX` | type | '/api/v1' |
| `gateway.ws_path` | `CODEX_PRO_GATEWAY__WS_PATH` | type | '/ws' |
| `gateway.ws_heartbeat_seconds` | `CODEX_PRO_GATEWAY__WS_HEARTBEAT_SECONDS` | type | 30.0 |
| `gateway.session_policy.mode` | `CODEX_PRO_GATEWAY__SESSION_POLICY__MODE` | _LiteralGenericAlias | 'idle' |
| `gateway.session_policy.daily_reset_hour` | `CODEX_PRO_GATEWAY__SESSION_POLICY__DAILY_RESET_HOUR` | type | 4 |
| `gateway.session_policy.idle_timeout_minutes` | `CODEX_PRO_GATEWAY__SESSION_POLICY__IDLE_TIMEOUT_MINUTES` | type | 1440 |
| `gateway.auth.mode` | `CODEX_PRO_GATEWAY__AUTH__MODE` | _LiteralGenericAlias | 'allowlist' |
| `gateway.auth.allowed_users` | `CODEX_PRO_GATEWAY__AUTH__ALLOWED_USERS` | GenericAlias | PydanticUndefined |
| `gateway.auth.admin_users` | `CODEX_PRO_GATEWAY__AUTH__ADMIN_USERS` | GenericAlias | PydanticUndefined |
| `gateway.auth.api_tokens` | `CODEX_PRO_GATEWAY__AUTH__API_TOKENS` | GenericAlias | PydanticUndefined |
| `gateway.auth.admin_tokens` | `CODEX_PRO_GATEWAY__AUTH__ADMIN_TOKENS` | GenericAlias | PydanticUndefined |
| `gateway.auth.allowed_origins` | `CODEX_PRO_GATEWAY__AUTH__ALLOWED_ORIGINS` | GenericAlias | PydanticUndefined |
| `gateway.auth.token_header` | `CODEX_PRO_GATEWAY__AUTH__TOKEN_HEADER` | type | 'X-Codex Pro-Token' |
| `gateway.auth.pairing_ttl_seconds` | `CODEX_PRO_GATEWAY__AUTH__PAIRING_TTL_SECONDS` | type | 300 |
| `gateway.auth.allowed_hosts` | `CODEX_PRO_GATEWAY__AUTH__ALLOWED_HOSTS` | GenericAlias | PydanticUndefined |
| `gateway.platforms` | `CODEX_PRO_GATEWAY__PLATFORMS` | GenericAlias | PydanticUndefined |
| `gateway.media_cache_dir` | `CODEX_PRO_GATEWAY__MEDIA_CACHE_DIR` | type | 'data/media_cache' |
| `gateway.media_cache_max_mb` | `CODEX_PRO_GATEWAY__MEDIA_CACHE_MAX_MB` | type | 500 |
| `gateway.media_max_file_mb` | `CODEX_PRO_GATEWAY__MEDIA_MAX_FILE_MB` | type | 25 |
| `gateway.media_max_urls_per_message` | `CODEX_PRO_GATEWAY__MEDIA_MAX_URLS_PER_MESSAGE` | type | 10 |
| `gateway.media_download_concurrency` | `CODEX_PRO_GATEWAY__MEDIA_DOWNLOAD_CONCURRENCY` | type | 4 |
| `gateway.media_allow_private_addresses` | `CODEX_PRO_GATEWAY__MEDIA_ALLOW_PRIVATE_ADDRESSES` | type | False |
| `gateway.hooks_dir` | `CODEX_PRO_GATEWAY__HOOKS_DIR` | type | '' |
| `planning.enabled` | `CODEX_PRO_PLANNING__ENABLED` | type | True |
| `planning.default_strategy` | `CODEX_PRO_PLANNING__DEFAULT_STRATEGY` | type | 'auto' |
| `planning.max_tree_depth` | `CODEX_PRO_PLANNING__MAX_TREE_DEPTH` | type | 5 |
| `planning.max_branches` | `CODEX_PRO_PLANNING__MAX_BRANCHES` | type | 3 |
| `planning.reflection_enabled` | `CODEX_PRO_PLANNING__REFLECTION_ENABLED` | type | True |
| `a2a.enabled` | `CODEX_PRO_A2A__ENABLED` | type | True |
| `a2a.agent_name` | `CODEX_PRO_A2A__AGENT_NAME` | type | 'codex-pro' |
| `a2a.agent_description` | `CODEX_PRO_A2A__AGENT_DESCRIPTION` | type | 'A modular AI agent framework' |
| `a2a.capabilities` | `CODEX_PRO_A2A__CAPABILITIES` | GenericAlias | PydanticUndefined |
| `a2a.task_ttl_seconds` | `CODEX_PRO_A2A__TASK_TTL_SECONDS` | type | 3600.0 |
| `a2a.max_tasks` | `CODEX_PRO_A2A__MAX_TASKS` | type | 1000 |
| `a2a.active_task_ttl_seconds` | `CODEX_PRO_A2A__ACTIVE_TASK_TTL_SECONDS` | type | 86400.0 |
| `evaluation.dataset_path` | `CODEX_PRO_EVALUATION__DATASET_PATH` | type | 'data/eval' |
| `evaluation.timeout_per_case` | `CODEX_PRO_EVALUATION__TIMEOUT_PER_CASE` | type | 120 |
| `bus.max_queue_size` | `CODEX_PRO_BUS__MAX_QUEUE_SIZE` | type | 1000 |
| `bus.max_concurrency` | `CODEX_PRO_BUS__MAX_CONCURRENCY` | type | 50 |
| `rate_limit.session_rpm` | `CODEX_PRO_RATE_LIMIT__SESSION_RPM` | type | 20 |
| `rate_limit.session_burst` | `CODEX_PRO_RATE_LIMIT__SESSION_BURST` | type | 5 |
| `circuit_breaker.failure_threshold` | `CODEX_PRO_CIRCUIT_BREAKER__FAILURE_THRESHOLD` | type | 5 |
| `circuit_breaker.recovery_seconds` | `CODEX_PRO_CIRCUIT_BREAKER__RECOVERY_SECONDS` | type | 60.0 |
| `circuit_breaker.half_open_max` | `CODEX_PRO_CIRCUIT_BREAKER__HALF_OPEN_MAX` | type | 2 |
| `plugins.enabled` | `CODEX_PRO_PLUGINS__ENABLED` | type | True |
| `plugins.allow` | `CODEX_PRO_PLUGINS__ALLOW` | GenericAlias | PydanticUndefined |
| `plugins.deny` | `CODEX_PRO_PLUGINS__DENY` | GenericAlias | PydanticUndefined |
| `plugins.extra_dirs` | `CODEX_PRO_PLUGINS__EXTRA_DIRS` | GenericAlias | PydanticUndefined |
| `plugins.config` | `CODEX_PRO_PLUGINS__CONFIG` | GenericAlias | PydanticUndefined |
| `plugins.trusted_plugins` | `CODEX_PRO_PLUGINS__TRUSTED_PLUGINS` | GenericAlias | PydanticUndefined |
| `plugins.permission_mode` | `CODEX_PRO_PLUGINS__PERMISSION_MODE` | _LiteralGenericAlias | 'compat' |
| `ui.locale` | `CODEX_PRO_UI__LOCALE` | _LiteralGenericAlias | 'auto' |
| `agent.max_iterations` | `CODEX_PRO_AGENT__MAX_ITERATIONS` | type | 40 |
| `agent.tool_concurrency.enabled` | `CODEX_PRO_AGENT__TOOL_CONCURRENCY__ENABLED` | type | True |
| `agent.tool_concurrency.max_concurrent` | `CODEX_PRO_AGENT__TOOL_CONCURRENCY__MAX_CONCURRENT` | type | 4 |
| `agent.heartbeat.enabled` | `CODEX_PRO_AGENT__HEARTBEAT__ENABLED` | type | True |
| `agent.heartbeat.first_delay_sec` | `CODEX_PRO_AGENT__HEARTBEAT__FIRST_DELAY_SEC` | type | 30 |
| `agent.heartbeat.min_interval_sec` | `CODEX_PRO_AGENT__HEARTBEAT__MIN_INTERVAL_SEC` | type | 60 |
| `agent.heartbeat.verbosity` | `CODEX_PRO_AGENT__HEARTBEAT__VERBOSITY` | _LiteralGenericAlias | 'key_milestones' |
| `agent.heartbeat.template` | `CODEX_PRO_AGENT__HEARTBEAT__TEMPLATE` | type | '⏳ {activity}（已用时 {elapsed}）' |
| `agent.inspection.enabled` | `CODEX_PRO_AGENT__INSPECTION__ENABLED` | type | False |
| `agent.inspection.tick_interval_sec` | `CODEX_PRO_AGENT__INSPECTION__TICK_INTERVAL_SEC` | type | 300 |
| `agent.inspection.inspect_file` | `CODEX_PRO_AGENT__INSPECTION__INSPECT_FILE` | type | 'INSPECT.md' |
| `agent.inspection.max_items_per_tick` | `CODEX_PRO_AGENT__INSPECTION__MAX_ITEMS_PER_TICK` | type | 5 |
| `agent.inspection.deliver_channel` | `CODEX_PRO_AGENT__INSPECTION__DELIVER_CHANNEL` | type | '' |
| `agent.inspection.deliver_chat_id` | `CODEX_PRO_AGENT__INSPECTION__DELIVER_CHAT_ID` | type | '' |
| `evolution.enabled` | `CODEX_PRO_EVOLUTION__ENABLED` | type | False |
| `evolution.trigger_mode` | `CODEX_PRO_EVOLUTION__TRIGGER_MODE` | _LiteralGenericAlias | 'manual' |
| `evolution.threshold_trajectories` | `CODEX_PRO_EVOLUTION__THRESHOLD_TRAJECTORIES` | type | 50 |
| `evolution.cron_expression` | `CODEX_PRO_EVOLUTION__CRON_EXPRESSION` | type | '0 4 * * *' |
| `evolution.max_candidates_per_run` | `CODEX_PRO_EVOLUTION__MAX_CANDIDATES_PER_RUN` | type | 3 |
| `evolution.max_trajectories_per_run` | `CODEX_PRO_EVOLUTION__MAX_TRAJECTORIES_PER_RUN` | type | 200 |
| `evolution.eval_dataset_path` | `CODEX_PRO_EVOLUTION__EVAL_DATASET_PATH` | type | 'data/eval/baseline.yaml' |
| `evolution.regression_threshold` | `CODEX_PRO_EVOLUTION__REGRESSION_THRESHOLD` | type | 0.05 |
| `evolution.require_strict_improvement` | `CODEX_PRO_EVOLUTION__REQUIRE_STRICT_IMPROVEMENT` | type | True |
| `evolution.min_eval_cases` | `CODEX_PRO_EVOLUTION__MIN_EVAL_CASES` | type | 3 |
| `evolution.record_trajectories` | `CODEX_PRO_EVOLUTION__RECORD_TRAJECTORIES` | type | True |
| `evolution.trajectory_retention_days` | `CODEX_PRO_EVOLUTION__TRAJECTORY_RETENTION_DAYS` | type | 30 |
| `evolution.evolver_model` | `CODEX_PRO_EVOLUTION__EVOLVER_MODEL` | type | '' |
| `evolution.skill_size_limit_bytes` | `CODEX_PRO_EVOLUTION__SKILL_SIZE_LIMIT_BYTES` | type | 50000 |
| `evolution.redact_args` | `CODEX_PRO_EVOLUTION__REDACT_ARGS` | type | True |
| `evolution.eval_parallel` | `CODEX_PRO_EVOLUTION__EVAL_PARALLEL` | type | 2 |
| `evolution.eval_timeout_seconds` | `CODEX_PRO_EVOLUTION__EVAL_TIMEOUT_SECONDS` | type | 60 |
| `evolution.cooldown_seconds_after_promote` | `CODEX_PRO_EVOLUTION__COOLDOWN_SECONDS_AFTER_PROMOTE` | type | 86400 |
| `evolution.auto_promote` | `CODEX_PRO_EVOLUTION__AUTO_PROMOTE` | type | True |
| `evolution.candidate_review_required` | `CODEX_PRO_EVOLUTION__CANDIDATE_REVIEW_REQUIRED` | type | False |
| `cost.enabled` | `CODEX_PRO_COST__ENABLED` | type | False |
| `cost.daily_budget_usd` | `CODEX_PRO_COST__DAILY_BUDGET_USD` | type | 0.0 |
| `cost.soft_threshold_ratio` | `CODEX_PRO_COST__SOFT_THRESHOLD_RATIO` | type | 0.8 |
| `cost.pricing_overrides` | `CODEX_PRO_COST__PRICING_OVERRIDES` | type | PydanticUndefined |
| `workspace` | `CODEX_PRO_WORKSPACE` | type | '~/.codex-pro' |

## Shell-Specific Syntax

### Bash / Zsh (Linux, macOS, WSL2)

```bash
# Single variable
export CODEX_PRO_GATEWAY__PORT=4000

# Multiple variables in .env file
cat >> ~/.bashrc << 'EOF'
export CODEX_PRO_MODELS__DEFAULT__API_KEY="sk-ant-..."
export CODEX_PRO_GATEWAY__AUTH__MODE="allowlist"
export CODEX_PRO_GATEWAY__AUTH__API_TOKENS="token1,token2"
EOF
source ~/.bashrc
```

### PowerShell (Windows)

```powershell
# Session variable
$env:CODEX_PRO_GATEWAY__PORT = "4000"

# Persistent (user-level)
[System.Environment]::SetEnvironmentVariable(
    "CODEX_PRO_MODELS__DEFAULT__API_KEY",
    "sk-ant-...",
    "User"
)
```

### Windows CMD

```batch
:: Session variable
set CODEX_PRO_GATEWAY__PORT=4000

:: Persistent
setx CODEX_PRO_MODELS__DEFAULT__API_KEY "sk-ant-..."
```

!!! warning "Windows path separators"
    On native Windows, use backslashes in `CODEX_PRO_STORAGE__BASE_DIR`. In WSL2, use forward slashes.

---

## Docker / Container Usage

### Docker Run

```bash
docker run -d \
  -e CODEX_PRO_GATEWAY__HOST=0.0.0.0 \
  -e CODEX_PRO_GATEWAY__PORT=3000 \
  -e CODEX_PRO_GATEWAY__AUTH__MODE=allowlist \
  -e CODEX_PRO_GATEWAY__AUTH__API_TOKENS="mytoken123" \
  -e CODEX_PRO_MODELS__DEFAULT__API_KEY="sk-ant-..." \
  -e CODEX_PRO_CHANNELS__TELEGRAM__ENABLED=true \
  -e CODEX_PRO_CHANNELS__TELEGRAM__TOKEN="123456:ABC..." \
  -v codex-pro-data:/root/.codex-pro/data \
  -p 3000:3000 \
  codex-pro:latest
```

### Docker Compose

```yaml
services:
  codex-pro:
    image: codex-pro:latest
    environment:
      CODEX_PRO_GATEWAY__HOST: "0.0.0.0"
      CODEX_PRO_GATEWAY__PORT: "3000"
      CODEX_PRO_GATEWAY__AUTH__MODE: "allowlist"
      CODEX_PRO_GATEWAY__AUTH__API_TOKENS: "mytoken123"
      CODEX_PRO_MODELS__DEFAULT__PROVIDER: "anthropic"
      CODEX_PRO_MODELS__DEFAULT__API_KEY: "${ANTHROPIC_API_KEY}"
      CODEX_PRO_OBSERVABILITY__LOG_LEVEL: "info"
      CODEX_PRO_OBSERVABILITY__LOG_FORMAT: "json"
    env_file:
      - .env
    volumes:
      - agent-data:/root/.codex-pro/data
    ports:
      - "3000:3000"

volumes:
  agent-data:
```

### Using `.env` Files

```bash
# .env file (do NOT commit to version control)
CODEX_PRO_MODELS__DEFAULT__API_KEY=sk-ant-api03-...
CODEX_PRO_CHANNELS__TELEGRAM__TOKEN=123456789:ABCdef...
CODEX_PRO_CHANNELS__DISCORD__TOKEN=MTIzNDU2...
CODEX_PRO_GATEWAY__AUTH__API_TOKENS=prod-token-abc,prod-token-def
```

!!! danger "Never commit secrets"
    Add `.env` to `.gitignore`. Use a secrets manager (Vault, AWS Secrets Manager, etc.) for production deployments.

---

## Debugging

### Verify Effective Configuration

```bash
# Show resolved config (env vars applied)
codex-pro config dump

# Explain where a specific value comes from
codex-pro config explain gateway.auth.mode
# Output: gateway.auth.mode = "allowlist" (from: environment variable CODEX_PRO_GATEWAY__AUTH__MODE)
```

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Env var ignored | Wrong nesting separator | Use `__` (double underscore) |
| Boolean not working | Unexpected string value | Use `true`/`false`, `1`/`0` |
| List has one item | Forgot comma separation | `"a,b,c"` or JSON `'["a","b"]'` |
| Variable not found | Typo in section name | Run `codex-pro config explain <path>` |
| Override not applied | CLI flag takes precedence | Remove conflicting CLI flags |

!!! tip "List all active env vars"
    ```bash
    env | grep CODEX_PRO_ | sort
    ```
