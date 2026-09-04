# Troubleshooting

Symptom-based troubleshooting guide. Find your problem below.

---

## Installation & Startup

### `codex-pro: command not found`

| Check | Command | Fix |
|-------|---------|-----|
| Installed? | `pip show codex-pro` | `pip install codex-pro` |
| PATH? | `python -m codex_pro --version` | Add pip scripts dir to PATH |
| Venv active? | `which python` | Activate your virtualenv |

### Setup wizard fails to validate model

- Check API key is correct
- Check network connectivity to provider endpoint
- If behind proxy, set `HTTP_PROXY`/`HTTPS_PROXY`
- Try: `codex-pro config validate`

## Gateway

### Port already in use

```bash
codex-pro gateway status  # check if already running
# Or use a different port:
# gateway.port: 0  (auto-assign)
```

On Windows, Hyper-V / WinNAT often reserves dynamic TCP ranges. If the default
`58123` falls inside one, bind fails with access denied (not “in use”). Check
with `netsh interface ipv4 show excludedportrange protocol=tcp`, set
`gateway.port` (e.g. `18789`), and for Vite set
`CODEX_PRO_GATEWAY_ORIGIN=http://127.0.0.1:18789` in
`web/.env.development.local`.

### Codex Pro returns 401/403

- Verify token in request matches `gateway.auth.apiTokens`
- Admin operations require `adminTokens`, not `apiTokens`
- Check for lockout (5 failed attempts = 300s ban)

### Codex Pro blank page

- Ensure the Codex Pro web UI is built: `codex-pro web build`
- Check browser console for errors
- Verify Gateway is running: `curl http://127.0.0.1:58123/api/v1/health`

## Channels

### Channel not receiving messages

1. Check channel is enabled: `codex-pro status`
2. Verify credentials in config
3. Check `allowFrom` list (empty = allow all)
4. Review Gateway logs for connection errors

### Duplicate messages

- Check for multiple agent instances running
- Verify deduplication (some channels handle this internally)

## Memory & Knowledge

### Memory not recalling relevant information

- Check `memory.enabled: true`
- Verify vector store is working: embedding model available?
- Check `retrievalTopK` is not set too low
- Review memory via Codex Pro Memory page

### FAISS/embedding unavailable

- Install vector extra: `pip install "codex-pro[vector]"`
- Falls back to BM25 text search without vector support

## Tools

### Tool stuck waiting for approval

- Set `permissions.approval.mode: auto` for unattended operation
- Or approve via TUI: `/approve`
- Check `tools.profile` allows the tool

## Service

### Service won't start after upgrade

```bash
codex-pro migrate status   # check for pending migrations
codex-pro migrate run      # apply them
codex-pro gateway start
```

## Getting Help

If none of the above resolves your issue:

1. Collect: version, OS, config (redacted), full error log
2. Search [existing issues](https://github.com/promoteAI/codex-pro/issues)
3. Open a new issue with the bug report template
