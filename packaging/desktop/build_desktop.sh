#!/bin/bash
# Build the desktop gateway executable (Linux/macOS).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> Building frontend..."
BUILD_LOG="$(mktemp)"

# pnpm install: a real failure aborts the build (no stale node_modules).
if ! (cd web && pnpm install --frozen-lockfile) >"$BUILD_LOG" 2>&1; then
  echo "error: pnpm install failed; aborting. See log below." >&2
  cat "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  exit 1
fi

# pnpm build: only the bundle-budget check (exceeds / budget) is tolerable —
# see web/scripts/check-bundle-size.mjs. Any other failure (tsc / vite) must
# abort so we never ship stale web/dist.
if ! (cd web && pnpm build) >"$BUILD_LOG" 2>&1; then
  if grep -qE 'exceeds|budget' "$BUILD_LOG"; then
    echo "  warning: frontend build failed on the bundle budget check (see web/scripts/check-bundle-size.mjs); continuing with web/dist."
  else
    echo "error: frontend build failed; aborting to avoid shipping stale web/dist. See log below." >&2
    cat "$BUILD_LOG" >&2
    rm -f "$BUILD_LOG"
    exit 1
  fi
fi
rm -f "$BUILD_LOG"

echo "==> Building desktop executable..."
export CODEX_PRO_ROOT="$ROOT"
pyinstaller --clean --noconfirm packaging/desktop/codex_pro.spec

echo "==> Done: $(ls dist/desktop/ 2>/dev/null || echo dist/)"
echo "   Look for codex-pro-desktop in dist/ or the build output."
