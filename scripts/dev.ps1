# Codex Pro 一键启动 (Windows / PowerShell)
# 用法:
#   .\scripts\dev-windows.ps1                          # 前端 :5173, 后端 :58123 (默认)
#   $env:PORT=3000; .\scripts\dev-windows.ps1          # 覆盖前端端口
#
# 行为:
#   * 后端以项目 .venv 里的 python 启动 `codex-pro gateway`, 监听 58123
#     (同时托管已构建的 web UI);
#   * 等后端健康检查 (/api/v1/health) 通过后, 才启动前端 Vite dev server (:5173),
#     并把 /api 与 /ws 代理到后端;
#   * Ctrl+C 时回收后端子进程, 前后端同时退出。
#
# 要求: PowerShell 5.1+ (Windows 默认) 或 PowerShell Core (pwsh)。

param(
    [int]$Port = 5173,
    [int]$GatewayPort = 58123
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = (Resolve-Path (Join-Path $scriptDir '..')).Path

Push-Location $projectDir

# --- Locate python ----------------------------------------------------------
$py = $null
$venvPython = Join-Path $projectDir '.venv\Scripts\python.exe'
if (Test-Path $venvPython) {
    $py = $venvPython
} elseif ($null -ne (Get-Command uv -ErrorAction SilentlyContinue)) {
    $py = 'uv run python'
} else {
    $py = 'python'
}

# --- Start backend (foreground; foreground so Ctrl+C reaches it too) --------
$healthUrl = "http://127.0.0.1:$GatewayPort/api/v1/health"
Write-Host "[dev] Starting backend gateway (port $GatewayPort) ..."

$process = Start-Process -FilePath $py `
    -ArgumentList '-m', 'codex_pro', 'gateway', '--port', $GatewayPort `
    -WorkingDirectory $projectDir `
    -NoNewWindow `
    -PassThru
$backendPid = $process.Id
Write-Host "[dev] Backend PID: $backendPid"

# --- Wait for backend health check ------------------------------------------
Write-Host "[dev] Waiting for backend health check ($healthUrl) ..."
$tries = 0
$healthOk = $false
while (-not $healthOk) {
    $tries++
    if ($tries -gt 60) {
        Write-Host "[dev] Backend health check timed out after 60s. Aborting." -ForegroundColor Red
        Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
        Pop-Location
        exit 1
    }
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 2 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $healthOk = $true
        }
    } catch {}
    Start-Sleep -Seconds 1
}
Write-Host "[dev] Backend health check passed." -ForegroundColor Green

# --- Start frontend ---------------------------------------------------------
Write-Host "[dev] Starting frontend dev server (http://localhost:$Port) ..."
Write-Host "[dev] Ctrl+C stops both backends."
$exitCode = $null
Set-Location $projectDir\web
if (Test-Path "$projectDir\web\node_modules\vite\bin\vite.js") {
    node node_modules\vite\bin\vite.js --port $Port | ForEach-Object { Write-Host $_ }
    $exitCode = 0
} else {
    Write-Host "[dev] Local vite bin not found, falling back to pnpm..."
    if ($null -ne (Get-Command corepack -ErrorAction SilentlyContinue)) {
        corepack pnpm dev -- --port $Port
        $exitCode = $LASTEXITCODE
    } else {
        npm run dev -- --port $Port
        $exitCode = $LASTEXITCODE
    }
}
Set-Location $projectDir

# --- Cleanup ----------------------------------------------------------------
if (-not $exitCode -or $exitCode -ne 0) {
    Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
    Write-Host "[dev] Stopping backend gateway (PID $backendPid) ..."
}

Pop-Location
exit $exitCode
