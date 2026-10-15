@echo off
title FRIDAY Unified System
set "FRIDAY_ROOT=%~dp0"
echo ============================================================
echo  FRIDAY UNIFIED SYSTEM — Booting...
echo ============================================================
echo.

echo [1/3] Starting Orchestrator (port 3001)...
start "FRIDAY Orchestrator" cmd /k "cd /d ""%FRIDAY_ROOT%apps\orchestrator"" && npm run dev"
timeout /t 4 /nobreak >nul

echo [2/3] Starting Sidecar (port 3002)...
start "FRIDAY Sidecar" cmd /k "cd /d ""%FRIDAY_ROOT%apps\sidecar"" && python main.py --save-frames"
timeout /t 3 /nobreak >nul

echo [3/3] Starting Frontend (port 3000)...
start "FRIDAY Frontend" cmd /k "cd /d ""%FRIDAY_ROOT%apps\web"" && npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo  ALL SYSTEMS ONLINE
echo ============================================================
echo  Frontend:     http://localhost:3000
echo  Orchestrator: http://localhost:3001
echo  Sidecar:      http://localhost:3002
echo ============================================================
echo.
echo Say "Hey FRIDAY" to activate voice mode.
echo Press any key to close this launcher window...
pause >nul
