# CLI Commands

Complete reference for the `codex-pro` command-line interface.

## Synopsis

```bash
codex-pro <command> [subcommand] [options]
```

## Global Options

| Flag | Short | Description |
|------|-------|-------------|
| `--config <path>` | `-c` | Path to configuration file (default: `~/.codex-pro/config.yaml`) |
| `--verbose` | `-v` | Increase log verbosity (repeatable: `-vv`, `-vvv`) |
| `--quiet` | `-q` | Suppress non-error output |
| `--version` | | Print version and exit |
| `--help` | `-h` | Show help for any command |

---

## run

Start the agent in foreground mode. This is the primary entry point for running Codex Pro as a long-lived process.

```bash
codex-pro run [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--channel <name>` | Activate a specific channel only | All enabled |
| `--no-gateway` | Disable the HTTP gateway | Gateway enabled |
| `--port <port>` | Override gateway listen port | `3007` |
| `--profile <name>` | Load a named configuration profile | — |
| `--dry-run` | Validate config and exit without starting | — |

```bash
# Start with default config
codex-pro run

# Start with a specific config file, verbose logging
codex-pro run -c ./my-config.yaml -vv

# Start only the Telegram channel
codex-pro run --channel telegram

# Validate configuration without starting
codex-pro run --dry-run
```

!!! tip
    Use `codex-pro gateway install` for production deployments instead of running in the foreground. The gateway subcommand registers Codex Pro as a system service.

---

## setup

Interactive first-run wizard that guides you through initial configuration.

```bash
codex-pro setup [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--non-interactive` | Use defaults without prompting | — |
| `--channel <name>` | Pre-select a channel to configure | — |
| `--model <model>` | Set the default model provider | — |

```bash
# Launch interactive setup
codex-pro setup

# Non-interactive setup with defaults
codex-pro setup --non-interactive --model openai
```

!!! tip
    Re-run `setup` at any time to reconfigure. Existing settings are preserved as defaults in the prompts.

---

## status

Display the current agent status including uptime, active channels, memory usage, and session count.

```bash
codex-pro status [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | — |
| `--watch` | Refresh continuously | — |
| `--interval <sec>` | Watch refresh interval | `2` |

```bash
# Quick status check
codex-pro status

# Machine-readable output
codex-pro status --json

# Continuous monitoring
codex-pro status --watch --interval 5
```

---

## cost

Show cost analytics for model API usage across sessions.

```bash
codex-pro cost [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--period <range>` | Time range: `today`, `week`, `month`, `all` | `today` |
| `--by <dimension>` | Group by: `model`, `channel`, `session`, `tool` | `model` |
| `--json` | Output as JSON | — |
| `--limit <n>` | Max rows to display | `20` |

```bash
# Today's costs grouped by model
codex-pro cost

# This week's costs by channel
codex-pro cost --period week --by channel

# Export all-time costs as JSON
codex-pro cost --period all --json
```

---

## gateway

Manage the Codex Pro gateway as a system service. The gateway provides HTTP/WebSocket access and runs the agent as a background daemon.

```bash
codex-pro gateway <subcommand> [options]
```

### Subcommands

#### gateway (no subcommand) / gateway foreground

Run the gateway in the foreground (equivalent to `codex-pro run`).

```bash
codex-pro gateway
codex-pro gateway foreground
```

#### gateway install

Register Codex Pro as a system service (systemd on Linux, launchd on macOS, Windows Service on Windows).

```bash
codex-pro gateway install [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--user` | Install as a user-level service | System-level |
| `--name <name>` | Custom service name | `codex-pro` |
| `--config <path>` | Config file the service should use | `~/.codex-pro/config.yaml` |

```bash
# Install as user service
codex-pro gateway install --user

# Install with custom name
codex-pro gateway install --name codex-pro-prod
```

#### gateway uninstall

Remove the registered system service.

```bash
codex-pro gateway uninstall [--name <name>]
```

#### gateway start

Start the installed service.

```bash
codex-pro gateway start [--name <name>]
```

#### gateway stop

Stop the running service.

```bash
codex-pro gateway stop [--name <name>]
```

#### gateway restart

Restart the service (stop + start).

```bash
codex-pro gateway restart [--name <name>]
```

#### gateway status

Show service status (running, stopped, pid, uptime).

```bash
codex-pro gateway status [--name <name>] [--json]
```

#### gateway logs

Tail or display gateway logs.

```bash
codex-pro gateway logs [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--follow` / `-f` | Stream logs continuously | — |
| `--lines <n>` / `-n` | Number of lines to show | `50` |
| `--level <level>` | Filter by minimum log level | `INFO` |

```bash
# Tail logs
codex-pro gateway logs -f

# Last 100 warning+ lines
codex-pro gateway logs -n 100 --level WARNING
```

---

## cli

Attach a thin client to a running local Gateway. The default renderer keeps
normal terminal scrollback; the full-screen Textual UI is opt-in.

```bash
codex-pro cli [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--port <port>` | Override the configured Gateway port | config / `58123` |
| `--token <token>` | API token for authentication | first configured token |
| `--user <id>` | User id; session key is `cli:<id>` | `local` |
| `-c`, `--config <path>` | Configuration file | auto-discovered |
| `-w`, `--workspace <path>` | Workspace and default transcript location | configured workspace |
| `--inline` | Native terminal scrollback renderer | default |
| `--tui` | Full-screen Textual renderer (requires `codex-pro[tui]`) | off |

```bash
# Connect to local gateway
codex-pro cli

# Opt in to the full-screen UI
codex-pro cli --tui
```

The client intentionally connects only to loopback. Use SSH port forwarding for
a remote Gateway. See [Terminal interaction commands](tui-commands.en.md).

---

## web

Build and manage the Codex Pro web UI bundle.

```bash
codex-pro web <subcommand>
```

### Subcommands

#### web build

Build the static Codex Pro web assets.

```bash
codex-pro web build [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--output <dir>` | Output directory | `~/.codex-pro/web/` |
| `--minify` | Minify assets | Enabled |

```bash
codex-pro web build
codex-pro web build --output ./dist
```

!!! tip
    The Codex Pro web UI is served automatically by the gateway at the root path. Use `web build` only if you need to pre-build or customize the output location.

---

## cron

Manage scheduled cron jobs that the agent can execute autonomously.

```bash
codex-pro cron <subcommand> [options]
```

### Subcommands

#### cron list

List all registered cron jobs and their status.

```bash
codex-pro cron list [--json]
```

#### cron authorize

Authorize a pending cron job for execution. **Requires the service to be
stopped** — see the warning below.

```bash
codex-pro cron authorize <job-id>
```

#### cron revoke

Revoke authorization for a cron job, preventing future runs. **Requires the
service to be stopped.**

```bash
codex-pro cron revoke <job-id>
```

!!! warning "authorize / revoke need the service stopped"
    Both rewrite `<workspace>/data/scheduler.json` directly. A running gateway
    holds every job in memory and periodically rewrites the whole file, so an
    offline edit would be overwritten — the commands therefore refuse outright
    when they find the instance lock held. While the service is up, authorize
    from chat ("authorize scheduled job `<job_id>`") or from Codex Pro cron
    page instead. `cron list` is read-only and always available.

```bash
# List all cron jobs
codex-pro cron list

# Authorize a specific job
codex-pro cron authorize cron_daily_summary

# Revoke a job
codex-pro cron revoke cron_cleanup
```

!!! warning
    Cron jobs can invoke tools autonomously without user interaction. Always review job definitions before authorizing. Use `codex-pro cron list --json` to inspect the full tool chain a job will execute.

---

## eval

Run the evaluation suite against the agent to measure quality, latency, and tool-use accuracy.

```bash
codex-pro eval [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--suite <name>` | Run a specific eval suite | All suites |
| `--dataset <path>` | Path to evaluation dataset | Built-in dataset |
| `--output <path>` | Write results to file | stdout |
| `--format <fmt>` | Output format: `text`, `json`, `csv` | `text` |
| `--parallel <n>` | Concurrent eval workers | `4` |
| `--model <model>` | Override model for evaluation | Config default |

```bash
# Run all evaluations
codex-pro eval

# Run specific suite with JSON output
codex-pro eval --suite tool-accuracy --format json --output results.json

# Use custom dataset
codex-pro eval --dataset ./my-evals.yaml --parallel 8
```

---

## service

!!! danger "Deprecated"
    The `service` command is deprecated since v0.1.0. Use `gateway` instead. This command will be removed in v0.5.0.

```bash
codex-pro service <subcommand>
```

All subcommands are forwarded to their `gateway` equivalents. A deprecation warning is emitted on every invocation.

---

## plugin

Manage plugins that extend agent capabilities.

```bash
codex-pro plugin <subcommand> [options]
```

### Subcommands

#### plugin list

List all discovered plugins and their status.

```bash
codex-pro plugin list [--json] [--all]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | — |
| `--all` | Include disabled plugins | Only enabled |

#### plugin info

Show detailed information about a plugin.

```bash
codex-pro plugin info <plugin-name>
```

#### plugin enable

Enable a plugin.

```bash
codex-pro plugin enable <plugin-name>
```

#### plugin disable

Disable a plugin without uninstalling.

```bash
codex-pro plugin disable <plugin-name>
```

#### plugin check

Verify plugin dependencies and compatibility.

```bash
codex-pro plugin check [<plugin-name>]
```

```bash
# List enabled plugins
codex-pro plugin list

# Get plugin details
codex-pro plugin info web-search-enhanced

# Enable a plugin
codex-pro plugin enable web-search-enhanced

# Check all plugins for issues
codex-pro plugin check
```

---

## evolution

Manage the skill evolution system that automatically improves agent skills based on usage data.

```bash
codex-pro evolution <subcommand> [options]
```

### Subcommands

#### evolution status

Show current evolution state: active generation, fitness scores, pending candidates.

```bash
codex-pro evolution status [--json]
```

#### evolution run

Trigger an evolution cycle manually (normally runs on schedule).

```bash
codex-pro evolution run [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--skill <name>` | Evolve a specific skill only | All eligible |
| `--generations <n>` | Number of generations to run | `1` |
| `--dry-run` | Simulate without persisting | — |

#### evolution list-candidates

List candidate skill variants awaiting evaluation or promotion.

```bash
codex-pro evolution list-candidates [--json] [--skill <name>]
```

#### evolution show-candidate

Display the full definition and metrics of a candidate.

```bash
codex-pro evolution show-candidate <candidate-id>
```

#### evolution promote

Promote a candidate to replace the current skill version.

```bash
codex-pro evolution promote <candidate-id> [--force]
```

#### evolution rollback

Roll back a skill to its previous version.

```bash
codex-pro evolution rollback <skill-name> [--to-version <n>]
```

#### evolution init-dataset

Initialize the evaluation dataset for skill evolution from session history.

```bash
codex-pro evolution init-dataset [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--skill <name>` | Target skill | Required |
| `--sessions <n>` | Number of recent sessions to sample | `100` |
| `--output <path>` | Dataset output path | Auto |

```bash
# Check evolution status
codex-pro evolution status

# Run one evolution cycle
codex-pro evolution run

# List candidates, optionally filtered by status
codex-pro evolution list-candidates
codex-pro evolution list-candidates --status pending

# Inspect one candidate
codex-pro evolution show-candidate cand_7f3a2b

# Promote a winning candidate
codex-pro evolution promote cand_7f3a2b

# Roll a skill back to its pre-change version
codex-pro evolution rollback summarize

# Bootstrap evaluation data
codex-pro evolution init-dataset
```

The positional argument is a skill name for `rollback` and a candidate id for `show-candidate` and `promote`. Apart from `--status` (which filters `list-candidates`), this subcommand takes no flags of its own — there is no `--force`, `--generations` or `--to-version`.

Rollback restores the version retained at promotion time; the evolution engine keeps no per-version history to select from.

---

## skill

Manage skills that have been staged by the evolution system or installed from external sources.

```bash
codex-pro skill <subcommand> [options]
```

### Subcommands

#### skill list-staged

List skills awaiting human approval before activation.

```bash
codex-pro skill list-staged [--json]
```

#### skill approve

Approve a staged skill for activation.

```bash
codex-pro skill approve <skill-name> [--version <n>]
```

#### skill reject

Reject a staged skill, preventing activation.

```bash
codex-pro skill reject <skill-name> [--reason <text>]
```

```bash
# See what's pending
codex-pro skill list-staged

# Approve a skill
codex-pro skill approve daily-digest

# Reject with reason
codex-pro skill reject risky-tool --reason "Uses unrestricted shell access"
```

---

## config

Configuration inspection and management utilities.

```bash
codex-pro config <subcommand> [options]
```

### Subcommands

#### config dump

Dump the fully-resolved configuration (all layers merged).

```bash
codex-pro config dump [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--format <fmt>` | Output format: `yaml`, `json` | `yaml` |
| `--redact` | Mask secrets and tokens | Enabled |
| `--no-redact` | Show secrets in plaintext | — |

#### config explain

Show where each config value originates (which layer set it).

```bash
codex-pro config explain [<field-path>]
```

```bash
# Show origin of all fields
codex-pro config explain

# Show origin of a specific field
codex-pro config explain gateway.port
```

#### config validate

Validate the configuration file and report errors.

```bash
codex-pro config validate [--config <path>]
```

#### config gen-docs

Auto-generate configuration documentation from the schema.

```bash
codex-pro config gen-docs [--output <path>] [--format <fmt>]
```

```bash
# Dump resolved config as JSON
codex-pro config dump --format json

# Validate a specific file
codex-pro config validate --config ./staging.yaml

# Regenerate config reference docs
codex-pro config gen-docs --output docs/reference/configuration.en.md
```

---

## checkpoint

Manage agent state checkpoints for backup and recovery.

```bash
codex-pro checkpoint <subcommand> [options]
```

### Subcommands

#### checkpoint list

List available checkpoints.

```bash
codex-pro checkpoint list [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | — |
| `--limit <n>` | Max checkpoints to list | `20` |
| `--before <date>` | Filter checkpoints before date | — |

#### checkpoint show

Display details of a specific checkpoint.

```bash
codex-pro checkpoint show <checkpoint-id>
```

#### checkpoint restore

Restore agent state from a checkpoint.

```bash
codex-pro checkpoint restore <checkpoint-id> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview what would be restored | — |
| `--components <list>` | Restore specific components: `memory`, `skills`, `config`, `all` | `all` |

!!! danger
    Restoring a checkpoint overwrites current agent state. A pre-restore checkpoint is automatically created for rollback.

#### checkpoint prune

Remove old checkpoints to reclaim disk space.

```bash
codex-pro checkpoint prune [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--keep <n>` | Number of recent checkpoints to retain | `10` |
| `--before <date>` | Prune checkpoints older than date | — |
| `--dry-run` | Preview deletions without removing | — |

```bash
# List recent checkpoints
codex-pro checkpoint list

# Inspect a checkpoint
codex-pro checkpoint show chk_20250815_143022

# Restore memory only
codex-pro checkpoint restore chk_20250815_143022 --components memory

# Clean up old checkpoints
codex-pro checkpoint prune --keep 5
```

---

## migrate

Database and data migration utilities.

```bash
codex-pro migrate <subcommand> [options]
```

### Subcommands

#### migrate run

Apply pending migrations.

```bash
codex-pro migrate run [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--to <version>` | Migrate up to a specific version | Latest |
| `--dry-run` | Show SQL without executing | — |

#### migrate rollback

Roll back the most recent migration (or to a specific version).

```bash
codex-pro migrate rollback [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--to <version>` | Roll back to a specific version | Previous |
| `--steps <n>` | Number of migrations to roll back | `1` |

#### migrate status

Show migration status: applied, pending, and current version.

```bash
codex-pro migrate status [--json]
```

#### migrate memory-md

Export memory contents as Markdown files (useful for inspection or migration to other systems).

```bash
codex-pro migrate memory-md [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--output <dir>` | Output directory | `./memory-export/` |
| `--format <fmt>` | Format: `flat`, `nested` | `flat` |

```bash
# Apply all pending migrations
codex-pro migrate run

# Check migration status
codex-pro migrate status

# Dry-run to preview SQL
codex-pro migrate run --dry-run

# Roll back last 2 migrations
codex-pro migrate rollback --steps 2

# Export memory as markdown
codex-pro migrate memory-md --output ./backup/memory
```

---

## deps

Manage runtime dependencies (optional packages for specific features).

```bash
codex-pro deps <subcommand> [options]
```

### Subcommands

#### deps status

Show dependency status: installed, missing, version mismatches.

```bash
codex-pro deps status [--json]
```

#### deps install

Install missing optional dependencies for enabled features.

```bash
codex-pro deps install [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--feature <name>` | Install deps for a specific feature only | All enabled |
| `--upgrade` | Upgrade existing packages to required versions | — |

#### deps refresh

Re-check and update the dependency lock state.

```bash
codex-pro deps refresh
```

```bash
# Check what's missing
codex-pro deps status

# Install all missing deps
codex-pro deps install

# Install only browser-related deps
codex-pro deps install --feature browser

# Upgrade outdated deps
codex-pro deps install --upgrade

# Refresh lock state after manual pip changes
codex-pro deps refresh
```

!!! tip
    Run `codex-pro deps status` after upgrading Codex Pro to identify newly required optional dependencies for features you use.
