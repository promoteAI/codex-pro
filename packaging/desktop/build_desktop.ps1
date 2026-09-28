# Build the desktop gateway executable (Windows).
$ErrorActionPreference = "Stop"
$ROOT = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $ROOT

# Run a native command, capturing both stdout and stderr into $out while keeping
# $ErrorActionPreference = "Stop". (Direct 2>&1 on a native command would be
# wrapped in an ErrorRecord and throw under Stop.)
function Invoke-Capture {
    param([scriptblock]$Script)
    $prior = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & $Script 2>&1
    $ec = $LASTEXITCODE
    $ErrorActionPreference = $prior
    return @{ Out = $out; ExitCode = $ec }
}

Write-Host "==> Building frontend..."
Push-Location web

# pnpm install: a real failure aborts the build (no stale node_modules).
$inst = Invoke-Capture { pnpm install --frozen-lockfile }
if ($inst.ExitCode -ne 0) {
    Write-Host "error: pnpm install failed; aborting. See output below (might be stale node_modules)." -ForegroundColor Red
    # Join into a single string first so Write-Host receives scalar input and
    # cannot trip over $ErrorActionPreference="Stop" + a non-UTF-8 console
    # codepage's StringToByte Literal path when handed an object[] via pipeline.
    Write-Host ($inst.Out | Out-String)
    Pop-Location
    exit 1
}

# pnpm build: only the bundle-budget check (exceeds / budget) is tolerable —
# see web/scripts/check-bundle-size.mjs. Any other failure (tsc / vite) must
# abort so we never ship stale web/dist.
$bld = Invoke-Capture { pnpm build }
if ($bld.ExitCode -ne 0) {
    $log = ($bld.Out | ForEach-Object { $_.ToString() }) -join "`n"
    if ($log -match "exceeds|[^a-z]budget") {
        Write-Warning "frontend build failed on the bundle budget check (see web/scripts/check-bundle-size.mjs); continuing with web/dist."
    } else {
        Write-Host "error: frontend build failed; aborting to avoid shipping stale web/dist. See output below." -ForegroundColor Red
        Write-Host ($bld.Out | Out-String)
        Pop-Location
        exit 1
    }
}
Pop-Location

Write-Host "==> Building desktop executable..."
$env:CODEX_PRO_ROOT = $ROOT
pyinstaller --clean --noconfirm packaging/desktop/codex_pro.spec

Write-Host "==> Done. Look for codex-pro-desktop(.exe) in dist/ or the build output."
