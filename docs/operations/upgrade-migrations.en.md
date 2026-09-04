# Upgrade & Migrations

Safely upgrade Codex Pro and migrate data between versions.

---

## Upgrade Process

```bash
# 1. Check current version
codex-pro --version

# 2. Stop the service
codex-pro gateway stop

# 3. Back up data
cp -r ~/.codex-pro ~/.codex-pro.bak

# 4. Upgrade
pip install --upgrade codex-pro

# 5. Run migrations
codex-pro migrate status
codex-pro migrate run

# 6. Restart
codex-pro gateway start

# 7. Verify
codex-pro status
```

## Migration Commands

```bash
# Check pending migrations
codex-pro migrate status

# Run all pending migrations
codex-pro migrate run

# Dry-run (preview only)
codex-pro migrate run --dry-run

# Rollback last migration
codex-pro migrate rollback

# Migrate memory.md format (legacy)
codex-pro migrate memory-md
```

## Configuration Migration

Configuration fields may be renamed or restructured between versions. Codex Pro automatically migrates known field changes during config loading.

Deprecated fields generate warnings:

```
WARNING: 'service' command is deprecated, use 'gateway <action>' instead
```

## Rollback

If issues arise after upgrade:

```bash
codex-pro gateway stop
pip install codex-pro==0.1.0  # previous version
cp -r ~/.codex-pro.bak/* ~/.codex-pro/
codex-pro migrate rollback
codex-pro gateway start
```

!!! warning "Downgrades rely on your own backup"
    During Beta, schema downgrade is not guaranteed. `codex-pro migrate rollback` undoes the migrations it applied, but a release that reshapes data may leave a rollback unable to reconstruct the original state exactly.

    That is why the sequence above copies the backup back **before** rolling back: the file copy is what actually restores the data, and `migrate rollback` reconciles the schema version afterwards. Skipping the backup step leaves you with no way back.

    See [compatibility](../reference/compatibility.en.md) for what each version step does guarantee.
