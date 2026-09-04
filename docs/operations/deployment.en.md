# Deployment

Strategies and recommendations for deploying Codex Pro in production.

---

## Deployment Checklist

- [ ] Choose appropriate [security profile](security-hardening.md)
- [ ] Configure model provider API keys
- [ ] Set up Gateway authentication tokens
- [ ] Configure TLS via reverse proxy
- [ ] Set up backup schedule
- [ ] Configure monitoring/alerting
- [ ] Review tool permissions

## Single-Server Deployment

The simplest production setup:

```bash
pip install "codex-pro[all]"
codex-pro setup
codex-pro gateway install
codex-pro gateway start
```

## Reverse Proxy

For public-facing deployments, always use a reverse proxy with TLS:

- [Nginx configuration](../integrations/gateway/reverse-proxy.md)
- [Caddy configuration](../integrations/gateway/reverse-proxy.md)

--8<-- "docs/includes/warning-public-gateway.en.md"

## Resource Requirements

| Scale | RAM | CPU | Disk |
|-------|-----|-----|------|
| Personal (1-2 channels) | 512MB | 1 core | 1GB |
| Small team (3-5 channels) | 1GB | 2 cores | 5GB |
| Heavy usage (all channels + knowledge) | 2GB+ | 4 cores | 10GB+ |

!!! note
    Model inference latency is typically the bottleneck, not local compute.

## Environment Variables

Set secrets via environment variables rather than config files:

```bash
export CODEX_PRO_MODELS__PROVIDERS__0__API_KEY="sk-..."
export CODEX_PRO_GATEWAY__AUTH__API_TOKENS__0="your-token"
```

See [Environment Variables Reference](../reference/environment-variables.md).
