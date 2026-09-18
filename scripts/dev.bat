@echo off
rem Codex Pro one-click dev startup (Windows): boots backend gateway + vite dev server.
rem   Frontend dev server on http://localhost:5173 (proxies /api and /ws to the gateway).
rem   Backend gateway listens on 58123 and also serves the built web UI.
rem   Waits for the backend health check to pass before starting the frontend.
rem   Close this window / Ctrl+C stops both.

setlocal enabledelayedexpansion
cd /d "%~dp0.."

rem --- Locate python (project venv first) ---
set "PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

set "PORT=5173"
set "GATEWAY_PORT=58123"
set "HEALTH_URL=http://127.0.0.1:%GATEWAY_PORT%/api/v1/health"

rem --- Start backend (in this console group so Ctrl+C reaches it too) ---
echo [dev] Starting backend gateway (port %GATEWAY_PORT%) ...
start /b "" "%PY%" -m codex_pro gateway --port %GATEWAY_PORT%

rem --- Wait for the backend health check to pass (goto loop, no paren block) ---
echo [dev] Waiting for backend health check (%HEALTH_URL%) ...
set "HEALTH_OK=0"
set /a TRIES=0
:waitloop
if "!HEALTH_OK!"=="1" goto :health_ok
set /a TRIES+=1
if !TRIES! gtr 60 goto :health_fail
"%PY%" -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%GATEWAY_PORT%/api/v1/health',timeout=2).status==200 else 1)" >nul 2>&1
if !errorlevel!==0 set "HEALTH_OK=1"
if "!HEALTH_OK!"=="0" ping -n 2 127.0.0.1 >nul
goto :waitloop

:health_ok
echo [dev] Backend health check passed.

:frontend
echo [dev] Starting frontend dev server (http://localhost:%PORT%) ...
echo [dev] Close this window / Ctrl+C stops both.
pushd "%~dp0..\web"
if exist "node_modules\vite\bin\vite.js" (
  node node_modules\vite\bin\vite.js --port %PORT%
) else (
  echo [dev] Local vite bin not found, falling back to npm.
  call npm run dev -- --port %PORT%
)
popd
goto :cleanup

:health_fail
echo [dev] Backend health check timed out (60s). Not starting frontend. 1>&2
goto :cleanup

:cleanup
echo [dev] Stopping backend gateway ...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like '*codex_pro gateway*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

endlocal
