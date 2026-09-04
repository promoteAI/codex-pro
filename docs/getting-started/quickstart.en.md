# Quickstart

Go from installation to your first message in 5 minutes.

---

## Step 1: Install

```bash
pip install codex-pro[all]
```

Verify the installation:

```bash
codex-pro --version
# codex-pro 0.1.0
```

!!! tip "Virtual Environment"
    It's recommended to install in a virtual environment to avoid dependency conflicts:

    ```bash
    python -m venv ~/.codex-pro/venv
    source ~/.codex-pro/venv/bin/activate
    pip install codex-pro[all]
    ```

---

## Step 2: Run the Setup Wizard

```bash
codex-pro setup
```

The wizard guides you through:

1. **Choose a model provider** — OpenAI, Anthropic, Gemini, Bedrock, OpenRouter, or OpenAI-compatible endpoints
2. **Enter your API key** — the key for your chosen provider
3. **Select a model** — e.g., `gpt-4o`, `claude-sonnet-4-20250514`, `gemini-2.0-flash`
4. **Basic settings** — Agent name, language preference, etc.

Configuration is saved to `~/.codex-pro/config.yaml`.

!!! note "Manual Configuration"
    Skip the wizard and edit the config file directly:

    ```bash
    mkdir -p ~/.codex-pro
    cat > ~/.codex-pro/config.yaml << 'EOF'
    model:
      provider: openai
      model: gpt-4o
      api_key: sk-your-key-here
    EOF
    ```

---

## Step 3: Start the Agent

```bash
codex-pro run
```

On successful startup, you'll see output like:

```
[INFO] Codex Pro v0.1.0 starting...
[INFO] Model: openai/gpt-4o
[INFO] Memory: loaded (42 entries)
[INFO] Skills: 12 active
[INFO] Channels: cli
[INFO] Ready. Type your message below.
```

---

## Step 4: Send Your First Message

Type a message directly in the terminal and press Enter:

```
You: Hello, tell me about yourself
```

The Agent will respond and remember the conversation. You can continue chatting — it maintains context across turns.

---

## Step 5: Verify Success

Confirm that everything is working:

```bash
# Check running status
codex-pro status

# View cost statistics
codex-pro cost

# List loaded skills
codex-pro skill list
```

!!! tip "Verify Memory"
    Restart the Agent and ask what you talked about last time. If it recalls, the memory system is working correctly.

---

## Next Steps

You've successfully run Codex Pro. Here's where to go next:

- **Connect more platforms** — Integrate with DingTalk, WeChat, Slack, and more. See [Channel Configuration](../integrations/channels/index.md)
- **Run in background** — Configure as a system service for 24/7 availability. See [Deployment Guide](../operations/deployment.md)
- **Open Codex Pro** — Manage your Agent via the web panel:
  ```bash
  codex-pro gateway
  # Open http://localhost:8080 in your browser
  ```
- **Explore skills** — View and manage the Agent's skill library:
  ```bash
  codex-pro skill list
  codex-pro evolution status
  ```
- **Scheduled tasks** — Have the Agent run tasks on a schedule:
  ```bash
  codex-pro cron add "Report weather every morning at 9am" --schedule "0 9 * * *"
  ```
