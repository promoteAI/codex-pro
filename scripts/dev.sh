#!/usr/bin/env bash
# Codex Pro 一键启动(开发模式):同时拉起后端 gateway 与前端 vite dev server。
# 用法:
#   bash scripts/dev.sh            # 前端 5173,后端 58123(默认)
#   PORT=3000 bash scripts/dev.sh  # 覆盖前端端口
#
# 行为:
#   * 后端以 .venv 里的 python 启动 `codex-pro gateway`(前台等价物),监听 58123,
#     同时托管已构建的 web UI;
#   * 前端以 Vite dev server 启动(5173),并把 /api 与 /ws 代理到后端;
#   * Ctrl+C 时自动回收后端子进程。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# --- 环境探测 ----------------------------------------------------------------
PYTHON="${PYTHON:-}"
if [ -z "$PYTHON" ]; then
  if [ -x ".venv/bin/python" ]; then PYTHON="$PROJECT_DIR/.venv/bin/python";
  elif [ -x ".venv/Scripts/python.exe" ]; then PYTHON="$PROJECT_DIR/.venv/Scripts/python.exe";
  elif command -v uv >/dev/null 2>&1; then PYTHON="uv run python";
  else PYTHON="python3"; fi
fi

# 前端包管理器:优先 pnpm,回退到 npx。
if command -v pnpm >/dev/null 2>&1; then
  PKG="pnpm"
elif command -v npm >/dev/null 2>&1; then
  PKG="npm"
elif command -v npx >/dev/null 2>&1; then
  PKG="npx"
else
  echo "[dev] 未找到 pnpm/npm/npx,无法启动前端。" >&2
  exit 1
fi

PORT="${PORT:-5173}"
GATEWAY_PORT="${GATEWAY_PORT:-58123}"

# --- 启动后端(后台) -----------------------------------------------------------
echo "[dev] 启动后端 gateway(端口 $GATEWAY_PORT)..."
"$PYTHON" -m codex_pro gateway --port "$GATEWAY_PORT" &
BACKEND_PID=$!

cleanup() {
  echo ""
  echo "[dev] 正在停止后端 (PID $BACKEND_PID)..."
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 留出后端启动时间
sleep 2

echo "[dev] 启动前端 dev server(http://localhost:$PORT)..."
echo "[dev] Ctrl+C 退出并同时停止后端。"
( cd "$PROJECT_DIR/web" && "$PKG" dev --port "$PORT" )
