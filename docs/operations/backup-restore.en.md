# Backup & Restore

Protect your Codex Pro data with regular backups.

---

## What to Back Up

| Data | Location | Priority |
|------|----------|----------|
| Configuration | `~/.codex-pro/config.yaml` | High |
| SQLite database | `~/.codex-pro/data/codex_pro.db` | High |
| Memory store | `~/.codex-pro/data/memory/` | High |
| Knowledge base | `~/.codex-pro/data/knowledge/` | Medium |
| Skills (user) | `~/.codex-pro/skills/` | Medium |
| Checkpoints | `~/.codex-pro/data/checkpoints/` | Low |
| Logs | `~/.codex-pro/data/logs/` | Low |

## Backup Procedure

```bash
# Stop the service first for consistency
codex-pro gateway stop

# Create backup
BACKUP_DIR="codex-pro-backup-$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"
cp -r ~/.codex-pro/config.yaml "$BACKUP_DIR/"
cp -r ~/.codex-pro/data/ "$BACKUP_DIR/"
cp -r ~/.codex-pro/skills/ "$BACKUP_DIR/"

# Restart
codex-pro gateway start
```

!!! warning
    Always stop the Gateway before backing up SQLite databases to avoid corruption.

## Restore { #restore-sqlite-backup }

```bash
codex-pro gateway stop
cp -r "$BACKUP_DIR/data/" ~/.codex-pro/
cp "$BACKUP_DIR/config.yaml" ~/.codex-pro/
codex-pro gateway start
```

## Checkpoint System

Codex Pro provides built-in file checkpoints:

```bash
codex-pro checkpoint list
codex-pro checkpoint show <id>
codex-pro checkpoint restore <id>
```

Checkpoints track file-level changes made by the agent and allow targeted rollback.

!!! warning "What checkpoints do not cover"
    A checkpoint is a shadow Git snapshot of workspace **files**. Its exclusion list covers the SQLite database, the sessions directory, the memory directory and the logs directory — a file-level snapshot of a live SQLite file would be a torn read — so none of that data is captured.

    `checkpoint restore` therefore does not restore sessions or memory. Recover those from a SQLite backup as described below.
