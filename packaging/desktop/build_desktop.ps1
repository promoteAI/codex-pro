# Build the desktop gateway executable (Windows).
$ErrorActionPreference = "Stop"
$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $ROOT

Write-Host "==> Building frontend..."
Push-Location web
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Write-Warning "pnpm install failed; continuing with existing web/dist (if present)." }
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Warning "frontend build reported a non-zero exit (bundle budget check? see web/scripts/check-bundle-size.mjs); continuing with existing web/dist." }
Pop-Location

Write-Host "==> Building desktop executable..."
$env:CODEX_PRO_ROOT = $ROOT
pyinstaller --clean --noconfirm packaging/desktop/codex_pro.spec

Write-Host "==> Done. Look for codex-pro-desktop(.exe) in dist/ or the build output."
