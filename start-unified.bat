@echo off
setlocal
title FRIDAY Unified System
set "ROOT=%~dp0"

echo ============================================================
echo  FRIDAY UNIFIED SYSTEM — Booting...
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not on PATH. Install it from https://nodejs.org/ then run install.bat.
    pause
    exit /b 1
)
if not exist "%ROOT%apps\orchestrator\node_modules\" (
    echo [ERROR] Missing apps\orchestrator\node_modules. Run install.bat first.
    pause
    exit /b 1
)
if not exist "%ROOT%apps\web\node_modules\" (
    echo [ERROR] Missing apps\web\node_modules. Run install.bat first.
    pause
    exit /b 1
)

echo [1/3] Starting Orchestrator on http://127.0.0.1:3001
start "FRIDAY Orchestrator" cmd /k "cd /d ""%ROOT%apps\orchestrator"" && npm run dev"

echo Waiting for /api/health ...
set /a TRIES=0
:wait_orch
set /a TRIES+=1
curl -sf http://127.0.0.1:3001/api/health >nul 2>&1
if not errorlevel 1 goto orch_ok
if %TRIES% GEQ 40 (
    echo [WARN] Orchestrator did not answer yet. The window will show the error.
    goto sidecar
)
ping 127.0.0.1 -n 2 >nul
goto wait_orch
:orch_ok
echo Orchestrator is up.

:sidecar
echo [2/3] Sidecar on http://127.0.0.1:3002 is optional.
where python >nul 2>&1
if errorlevel 1 (
    echo [SKIP] Python is not on PATH. Dashboard and orchestrator still start.
    goto web
)
if not exist "%ROOT%apps\sidecar\main.py" (
    echo [SKIP] apps\sidecar\main.py is missing.
    goto web
)
start "FRIDAY Sidecar" cmd /k "cd /d ""%ROOT%apps\sidecar"" && python main.py --save-frames"

:web
echo [3/3] Starting dashboard on http://127.0.0.1:3000
start "FRIDAY Frontend" cmd /k "cd /d ""%ROOT%apps\web"" && npm run dev"

echo.
echo ============================================================
echo  LAUNCHED
echo ============================================================
echo  Dashboard:    http://127.0.0.1:3000
echo  Orchestrator: http://127.0.0.1:3001/api/health
echo  Sidecar:      http://127.0.0.1:3002  ^(only if Python started^)
echo ============================================================
echo.
echo Ctrl+Enter on the deck toggles live voice.
echo Press any key to close this launcher window...
pause >nul
endlocal
