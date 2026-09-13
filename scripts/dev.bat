@echo off
rem Codex Pro one-click dev startup (Windows): boots backend gateway + vite dev server.
rem Usage: scripts\dev.bat
rem   Frontend dev server on http://localhost:5173 (proxy /api and /ws to backend).
rem   Backend gateway listens on 58123 and also serves the built web UI.
rem   Close the window / Ctrl+C to stop the frontend; the backend is killed on exit.

setlocal
cd /d "%~dp0.."

set "KILL_ON_EXIT="
rem Locate python from the project venv, else fall back.
set "PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
if not exist "%PY%" set "PY=py -3"

rem Frontend package manager: pnpm preferred, then npm.
set "PKG=pnpm"
where pnpm >nul 2>nul || set "PKG=npm"

set "PORT=5173"
set "GATEWAY_PORT=58123"

echo [dev] Starting backend gateway (port %GATEWAY_PORT%) ...
start "codex-pro-gateway" /min cmd /c ""%PY%" -m codex_pro gateway --port %GATEWAY_PORT%"
set /a TRY=0
:wait
timeout /t 1 /nobreak >nul
set /a TRY+=1
if %TRY% lss 8 goto wait

echo [dev] Starting frontend dev server (http://localhost:%PORT%) ...
pushd web
if "%PKG%"=="npm" (
  npm run dev -- --port %PORT%
) else (
  pnpm dev --port %PORT%
)
popd

endlocal
