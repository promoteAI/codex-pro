# Installation Guide

## System Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| Python | 3.11 | 3.12 |
| OS | Linux / macOS / Windows | Ubuntu 22.04+ / macOS 13+ |
| RAM | 512 MB | 2 GB+ |
| Disk | 200 MB | 1 GB+ (with vector indices) |

**OS Support Matrix:**

| Operating System | Status | Notes |
|-----------------|--------|-------|
| Ubuntu 22.04+ | :white_check_mark: Fully supported | Recommended for production |
| Debian 12+ | :white_check_mark: Fully supported | |
| macOS 13+ (ARM/x86) | :white_check_mark: Fully supported | |
| Windows + WSL2 | :white_check_mark: Fully supported | Recommended for Windows users |
| Native Windows | :warning: Basic support | Some limitations, see below |
| Alpine Linux | :warning: Basic support | Manual build deps required |

---

## Installation Methods

=== "pip (Recommended)"

    Install the full version (all model providers and features):

    ```bash
    pip install codex-pro[all]
    ```

    Or install core + specific providers only:

    ```bash
    # Minimal install (core runtime only)
    pip install codex-pro

    # Add model providers as needed
    pip install codex-pro[openai]
    pip install codex-pro[anthropic]
    pip install codex-pro[gemini]
    pip install codex-pro[bedrock]

    # Combined install
    pip install codex-pro[openai,anthropic,vector,browser]
    ```

=== "From Source"

    ```bash
    git clone https://github.com/promoteAI/codex-pro.git
    cd codex-pro
    pip install -e ".[all]"
    ```

    For development, also install dev dependencies:

    ```bash
    pip install -e ".[all,dev]"
    ```

=== "One-line Install Script"

    For Linux / macOS / WSL2:

    ```bash
    curl -fsSL https://raw.githubusercontent.com/codex-pro/master/scripts/install.sh | bash
    ```

    The script automatically detects your system, installs Python if needed, and installs codex-pro[all] via pip.

    !!! note "Script Behavior"
        - Detects and installs Python 3.11+ (via system package manager)
        - Creates a virtual environment at `~/.codex-pro/venv`
        - Installs `codex-pro[all]` into the virtual environment
        - Symlinks the `codex-pro` command to `~/.local/bin`

---

## Optional Dependencies (extras)

| Extra | Purpose | Key Packages |
|-------|---------|--------------|
| `openai` | OpenAI / compatible endpoints | openai, httpx[socks] |
| `anthropic` | Anthropic Claude | anthropic, httpx[socks] |
| `bedrock` | AWS Bedrock | anthropic, boto3 |
| `gemini` | Google Gemini | google-generativeai |
| `allproviders` | All model providers | All of the above |
| `vector` | Vector search | faiss-cpu |
| `browser` | Browser automation | playwright |
| `weixin` | WeChat channel | cryptography, pilk |
| `container` | Container sandbox | docker |
| `documents` | Document parsing | pymupdf, python-docx, openpyxl |
| `tui` | Terminal UI | textual |
| `tokenizers` | Token counting | tiktoken |
| `otel` | OpenTelemetry tracing | opentelemetry-* |
| `skills` | Built-in skill deps | duckduckgo_search, trafilatura, etc. |
| `all` | Full install | Everything above |

---

## Native Windows Notes

!!! warning "Native Windows Limitations"
    Native Windows installation has the following known limitations:

    - `faiss-cpu` does not provide official Windows wheels; use conda or unofficial sources
    - Signal handling (graceful shutdown) behaves differently from Unix
    - Some skill dependencies (e.g., `tesseract`) require separate installation
    - WSL2 is strongly recommended instead

    Native Windows installation:

    ```powershell
    # Ensure Python 3.11+ is installed
    python --version

    # Minimal install (no faiss-cpu)
    pip install codex-pro[openai,anthropic]

    # Full install
    pip install codex-pro[all]
    ```

!!! note "faiss and fastembed are different things"
    `faiss-cpu` belongs to the `[vector]` and `[all]` extras, so it can be skipped by choosing extras; without it, vector retrieval degrades to keyword search rather than failing.

    `fastembed`, by contrast, is a **core dependency**: every installation pulls it in and no choice of extras avoids it. It depends on ONNX Runtime, which needs compiling on some platforms. If the install stalls there, WSL2 is the recommended route on Windows — resident-service registration is likewise limited to Linux / macOS / WSL2.

---

## Frontend Codex Pro Build

The built-in Codex Pro is pre-packaged in the `codex-pro[all]` wheel. If you installed from source and need the web UI:

```bash
# Install Node.js dependencies
cd web
pnpm install

# Build frontend
pnpm build

# Output goes to web/dist, auto-loaded by codex-pro at startup
```

!!! tip "Skip Frontend Build"
    If you don't need the web UI, skip this step. Codex Pro's core functionality does not depend on the frontend.
    The `codex-pro gateway` command auto-detects and serves `web/dist` when available.

---

## Playwright Browser Dependencies

If you need browser automation skills:

```bash
# Install Playwright browsers
playwright install chromium

# Or install all browsers
playwright install

# Install system dependencies (Linux)
playwright install-deps chromium
```

!!! note "Install on Demand"
    Browser dependencies are only needed for `browser`-related skills and do not affect core Agent operation.

---

## Verify Installation

```bash
# Check version
codex-pro --version
# Output: codex-pro 0.1.0

# Check status
codex-pro status

# Run dependency check
codex-pro deps
```

`codex-pro deps` checks all optional dependencies and reports any missing items.

!!! tip "Success Indicator"
    Seeing the version number confirms a successful installation. Next, read the [Quickstart](quickstart.en.md) to complete initial configuration.
