# Filesystem Layout Reference

Codex Pro organizes data across global and workspace-level directories. This page documents every directory, file, and their purposes.

---

## Directory Hierarchy

### Global Directory (`~/.codex-pro/`)

The global directory stores user-wide configuration, data, and runtime state.

```
~/.codex-pro/
├── config.yaml              # Global configuration file
├── credentials.yaml         # Encrypted credentials store
├── profiles/                # Named configuration profiles
│   ├── personal.yaml
│   └── work.yaml
├── data/
│   ├── codex_pro.db        # Main SQLite database
│   ├── memory/              # Memory export and backup files
│   │   ├── episodic/        # Episodic memory segments
│   │   └── semantic/        # Semantic memory index
│   ├── knowledge/           # Knowledge base documents
│   │   ├── documents/       # Ingested source files
│   │   ├── index/           # Vector index files
│   │   └── metadata.json    # Index metadata
│   ├── spill/               # Large content overflow
│   │   └── *.spill          # Individual spill files
│   ├── logs/                # Audit trails and trace files
│   │   ├── tool_audit.jsonl # Tool invocation audit
│   │   └── memory_audit.jsonl
│   └── checkpoints/         # State checkpoints
│       └── <timestamp>/     # Individual checkpoint dirs
├── plugins/                 # Installed plugin packages
│   └── <plugin-name>/
│       ├── manifest.json
│       └── ...
├── skills/                  # Evolved and installed skills
│   ├── promoted/            # Production-ready skills
│   ├── staged/              # Awaiting approval
│   └── candidates/          # Evolution candidates
├── cache/                   # Temporary runtime cache
│   ├── models/              # Model response cache
│   ├── web/                 # Web fetch cache
│   └── media/               # Generated media cache
└── gateway.pid              # Gateway process PID file
```

### Workspace Directory (`.codex-pro/`)

Each project can have a local `.codex-pro/` directory for workspace-specific overrides.

```
.codex-pro/
├── config.yaml              # Workspace config overrides
├── knowledge/               # Project-specific knowledge
│   └── docs/                # Local documents for RAG
├── skills/                  # Project-specific skills
├── memory/                  # Workspace-scoped memory
└── .gitignore               # Excludes sensitive files
```

!!! tip "Version control"
    Add `.codex-pro/config.yaml` and `.codex-pro/knowledge/` to version control. Exclude `.codex-pro/memory/` and any credential files.

---

## File Descriptions

### Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `config.yaml` | Global / Workspace | Primary configuration |
| `credentials.yaml` | Global only | Encrypted API keys and tokens |
| `profiles/*.yaml` | Global only | Named configuration presets |
| `gateway.pid` | Global only | Running gateway process ID |

### Database Files

There is a single SQLite database, not one file per subsystem. Its path comes from `storage.database_path`, default `data/codex_pro.db`:

| File | Purpose | Typical Size |
|------|---------|--------------|
| `codex_pro.db` | Sessions, tasks, scheduling, cost, evolution | 10 MB - 1 GB |
| `codex_pro.db-wal` | WAL journal | Varies |
| `codex_pro.db-shm` | Shared memory | Varies |

!!! warning "Database locking"
    SQLite databases use WAL mode for concurrent reads. Only one Codex Pro instance should write to a given database at a time. Running multiple agents against the same global directory is unsupported.

### Log Files

| File | Description |
|------|-------------|
| `tool_audit.jsonl` | Tool invocation audit trail |
| `memory_audit.jsonl` | Memory read/write audit trail |
| `loop_freeze.log` | Watchdog dump written when the event loop stalls |

Logs are not rotated by size or date, and there are no compressed archives — see [Trace files](#trace-files) for the one bound that does apply.

---

## Precedence Rules

When the same setting exists at multiple levels, the following precedence applies (highest to lowest):

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | CLI runtime overrides | `--gateway-port 4000` |
| 2 | Environment variables | `CODEX_PRO_GATEWAY__PORT=4000` |
| 3 | Workspace config | `.codex-pro/config.yaml` |
| 4 | Global user config | `~/.codex-pro/config.yaml` |
| 5 (lowest) | Package defaults | Built-in defaults |

For data directories, workspace-scoped data is used when it exists. Otherwise, the global directory is used.

---

## Platform-Specific Paths

| Platform | Global Directory | Notes |
|----------|-----------------|-------|
| Linux | `~/.codex-pro/` | `$HOME/.codex-pro/` |
| macOS | `~/.codex-pro/` | `$HOME/.codex-pro/` |
| Windows (WSL2) | `~/.codex-pro/` | Inside WSL filesystem |
| Windows (native) | `%USERPROFILE%\.codex-pro\` | Not recommended; use WSL2 |

!!! warning "Windows native paths"
    On native Windows, some tools (shell, process) have reduced functionality. WSL2 is strongly recommended for full feature support.

### Custom Base Directory

Override the global directory location:

```bash
# Via environment variable
export CODEX_PRO_STORAGE__BASE_DIR="/opt/codex-pro/data"

# Via config
storage:
  base_dir: /opt/codex-pro/data
```

---

## Permissions and Ownership

### Recommended Permissions (Linux/macOS)

| Path | Mode | Rationale |
|------|------|-----------|
| `~/.codex-pro/` | `700` | User-only access |
| `config.yaml` | `600` | May contain sensitive settings |
| `credentials.yaml` | `600` | Contains encrypted secrets |
| `data/` | `700` | Database and runtime data |
| `data/codex_pro.db` | `600` | Sensitive data store |
| `cache/` | `700` | Temporary data |
| `plugins/` | `700` | Executable plugin code |

```bash
# Set correct permissions on fresh install
chmod 700 ~/.codex-pro
chmod 600 ~/.codex-pro/config.yaml
chmod 600 ~/.codex-pro/credentials.yaml
find ~/.codex-pro/data -type f -name "*.db" -exec chmod 600 {} \;
```

!!! danger "Never run as root"
    Codex Pro should never run as root. The gateway binds to an unprivileged port (default 58123) on loopback and does not require elevated permissions.

---

## Size Management

### Spill Directory

The spill directory stores large content that exceeds context window limits. Files are automatically cleaned based on age.

| Setting | Default | Description |
|---------|---------|-------------|
| `spill.max_total_mb` | `512` | Maximum total spill directory size |
| `spill.retention_days` | `7` | Delete spill artifacts older than this |
| `spill.sweep_interval_hours` | `6` | How often the sweeper runs |

Cleanup applies both rules: artifacts past `retention_days` go first, and if the directory still exceeds `max_total_mb` the oldest remaining artifacts are removed until it fits.

### User Artifact Directory

`data/artifacts/` stores reports created and delivered through the `artifact_*` tools. It is completely separate from model-private spill storage. The layout uses a session hash, a random artifact ID, an immutable chunk journal and a manifest; internal paths are never shown to the model.

| Setting | Default | Description |
|---------|---------|-------------|
| `artifacts.root_dir` | `data/artifacts` | Dedicated workspace-relative directory |
| `artifacts.max_chunk_chars` | `3000` | Per-append limit, kept below common model output ceilings |
| `artifacts.max_artifact_mb` | `50` | Per-artifact size limit |
| `artifacts.retention_days` | `30` | Artifact retention period |
| `artifacts.max_total_mb` | `1024` | Total artifact storage limit |
| `artifacts.sweep_interval_hours` | `24` | Cleanup interval |

The sweeper deletes only directories with a valid session hash, artifact ID and matching manifest. Unknown directory shapes are not traversed or removed. Total-quota cleanup protects drafts updated within the last hour so it cannot race a report that is still being generated.

### Trace files

There is no size- or age-based log rotation, and no `observability.log_rotation` section. What is bounded is the number of trace files, capped by count:

```yaml
observability:
  log_level: INFO
  max_trace_files: 500   # oldest traces are pruned past this; <=0 disables pruning
```

### Checkpoint Pruning

Checkpoints can accumulate over time. Use the CLI to manage:

```bash
# List checkpoints with size
codex-pro checkpoint list

# Prune checkpoints older than 7 days
codex-pro checkpoint prune --older-than 7d

# Keep only the 10 most recent
codex-pro checkpoint prune --keep 10
```

### Database Maintenance

SQLite databases grow over time. Periodic VACUUM reduces file size:

```bash
# Manual vacuum (agent must be stopped)
sqlite3 ~/.codex-pro/data/codex_pro.db "VACUUM;"
```

!!! note "There is no built-in database maintenance command"
    Codex Pro ships no `db` subcommand, so `VACUUM` is run with the `sqlite3` CLI as shown above. Stop the gateway first: vacuuming a database with an active writer will fail or block.

    Routine operation rarely needs it. The database grows mainly through sessions and cost records, and space is reclaimed by session archival and memory forgetting rather than by manual compaction.

---

## Backup and Restore

### What to Back Up

| Priority | Path | Contains |
|----------|------|----------|
| Critical | `credentials.yaml` | API keys (encrypted) |
| Critical | `data/codex_pro.db` | Sessions, tasks, cost, evolution |
| High | `config.yaml` | Configuration |
| High | `data/memory/` | Agent memory store |
| High | `skills/promoted/` | Evolved skills |
| Medium | `data/knowledge/` | Knowledge base |
| Low | `cache/` | Regeneratable cache (skip) |
| Low | `data/spill/` | Temporary overflow (skip) |

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR="$HOME/codex-pro-backup/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Stop the agent first for consistent backup

# Copy critical files
cp ~/.codex-pro/config.yaml "$BACKUP_DIR/"
cp ~/.codex-pro/credentials.yaml "$BACKUP_DIR/"
cp ~/.codex-pro/data/codex_pro.db "$BACKUP_DIR/"
cp -r ~/.codex-pro/data/memory/ "$BACKUP_DIR/memory/"
cp -r ~/.codex-pro/skills/promoted/ "$BACKUP_DIR/skills/"
cp -r ~/.codex-pro/data/knowledge/ "$BACKUP_DIR/knowledge/"


codex "Backup complete: $BACKUP_DIR"
```

### Restore from Checkpoint

```bash
# List available checkpoints
codex-pro checkpoint list

# Restore a specific checkpoint
codex-pro checkpoint restore <checkpoint-id>
```

!!! tip "Automated backups"
    Use `codex-pro cron` to schedule periodic backups as a cron job within the agent itself.

---

## Workspace `.gitignore`

Recommended `.codex-pro/.gitignore` for workspace directories:

```gitignore
# Exclude sensitive and generated files
credentials.yaml
memory/
*.db
*.db-wal
*.db-shm
cache/
*.pid
*.log
```
