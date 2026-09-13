@echo off
rem Codex Pro one-click dev startup (Windows): boots backend gateway + vite dev server.
rem   Frontend dev server on http://localhost:5173 (proxies /api and /ws to the gateway).
rem   Backend gateway listens on 58123 and also serves the built web UI.
rem   Close this window / Ctrl+C stops both.

setlocal enabledelayedexpansion
cd /d "%~dp0.."

rem --- Locate python (project venv first) ---
set "PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

set "PORT=5173"
set "GATEWAY_PORT=58123"

echo [dev] Starting backend gateway (port %GATEWAY_PORT%) ...
start "codex-pro-gateway" /min "%PY%" -m codex_pro gateway --port %GATEWAY_PORT%

rem Wait a moment for the gateway to bind.
timeout /t 3 /nobreak >nul

echo [dev] Starting frontend dev server (http://localhost:%PORT%) ...
pushd "%~dp0..\web"
if exist "node_modules\vite\bin\vite.js" (
  echo [dev] Backend running on port %GATEWAY_PORT%. Starting Vite.
  node node_modules\vite\bin\vite.js --port %PORT%
) else (
  echo [dev] Local vite bin not found, falling back to npm.
  call npm run dev -- --port %PORT%
)
popd

endlocal
