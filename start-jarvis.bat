@echo off
setlocal
title FRIDAY - Starting...
set "ROOT=%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not on PATH. Install it from https://nodejs.org/ then run install.bat.
    pause
    exit /b 1
)

if not exist "%ROOT%apps\orchestrator\node_modules\" (
    echo [ERROR] Orchestrator dependencies are missing. Run install.bat first.
    pause
    exit /b 1
)
if not exist "%ROOT%apps\web\node_modules\" (
    echo [ERROR] Web dependencies are missing. Run install.bat first.
    pause
    exit /b 1
)

echo [1/2] Starting orchestrator on http://127.0.0.1:3001
start "FRIDAY Orchestrator" cmd /k "cd /d ""%ROOT%apps\orchestrator"" && npm run dev"

echo Waiting for /api/health ...
set /a TRIES=0
:wait_orch
set /a TRIES+=1
curl -sf http://127.0.0.1:3001/api/health >nul 2>&1
if not errorlevel 1 goto orch_ok
if %TRIES% GEQ 40 (
    echo [WARN] Orchestrator did not answer on :3001 yet. Check the orchestrator window.
    goto start_web
)
ping 127.0.0.1 -n 2 >nul
goto wait_orch

:orch_ok
echo Orchestrator is up.

:start_web
echo [2/2] Starting dashboard on http://127.0.0.1:3000
start "FRIDAY Dashboard" cmd /k "cd /d ""%ROOT%apps\web"" && npm run dev"

if exist "%ROOT%electron\node_modules\electron\dist\electron.exe" (
    echo Launching Electron shell...
    ping 127.0.0.1 -n 5 >nul
    start "FRIDAY Shell" "%ROOT%electron\node_modules\electron\dist\electron.exe" "%ROOT%electron\main.js"
) else if exist "%ROOT%electron\node_modules\.bin\electron.cmd" (
    echo Launching Electron shell...
    ping 127.0.0.1 -n 5 >nul
    start "FRIDAY Shell" "%ROOT%electron\node_modules\.bin\electron.cmd" "%ROOT%electron\main.js"
) else (
    echo Electron is not installed. Opening the dashboard in the browser.
    echo Run install.bat if you want the desktop shell.
    ping 127.0.0.1 -n 6 >nul
    start "" http://127.0.0.1:3000
)

endlocal
