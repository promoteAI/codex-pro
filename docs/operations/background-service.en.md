# Background Service

Run Codex Pro as a persistent background service for 24/7 operation.

---

## Linux (systemd)

```bash
# Install the service
codex-pro gateway install

# Manage
codex-pro gateway start
codex-pro gateway stop
codex-pro gateway restart
codex-pro gateway status
codex-pro gateway logs
```

The install command creates a systemd user service (`~/.config/systemd/user/codex-pro.service`) with `lingering` enabled for persistence across logouts.

!!! tip
    Enable lingering: `loginctl enable-linger $USER`

## macOS (launchd)

```bash
codex-pro gateway install
codex-pro gateway start
```

Creates a LaunchAgent plist at `~/Library/LaunchAgents/com.codex-pro.gateway.plist`.

## Alternative: tmux/screen

```bash
tmux new-session -d -s codex-pro 'codex-pro gateway'
tmux attach -t codex-pro
```

## Alternative: Docker

!!! note "No official image"
    There is no published Docker image and no Dockerfile in the repository; a container deployment has to be built yourself. Contributions in this area are [welcome](https://github.com/promoteAI/codex-pro/issues).

    Note that resident-service registration (`codex-pro gateway install`) targets systemd and launchd, so in a container you run `codex-pro gateway` in the foreground as the entrypoint instead.

## Verifying the Service

```bash
codex-pro status
# Or check health endpoint:
curl http://127.0.0.1:58123/api/v1/health
```

## Uninstalling

```bash
codex-pro gateway stop
codex-pro gateway uninstall
```
