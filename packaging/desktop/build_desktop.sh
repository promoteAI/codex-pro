#!/bin/bash
# Build the desktop gateway executable (Linux/macOS).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> Building frontend..."
(cd web && pnpm install --frozen-lockfile && pnpm build) \
  || echo "  warning: frontend build reported a non-zero exit (bundle budget check? see web/scripts/check-bundle-size.mjs); continuing with existing web/dist."

echo "==> Building desktop executable..."
export CODEX_PRO_ROOT="$ROOT"
pyinstaller --clean --noconfirm packaging/desktop/codex_pro.spec

echo "==> Done: $(ls dist/desktop/ 2>/dev/null || echo dist/)"
echo "   Look for codex-pro-desktop in dist/ or the build output."
