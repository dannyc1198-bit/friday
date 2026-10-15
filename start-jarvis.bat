@echo off
title FRIDAY - Starting...
set "FRIDAY_ROOT=%~dp0"

:: Start orchestrator in background (minimized)
start "" /MIN cmd /c "cd /d ""%FRIDAY_ROOT%apps\orchestrator"" && npm run dev"

:: Wait for orchestrator to boot
timeout /t 3 /nobreak >nul

:: Start web app in background (minimized)
start "" /MIN cmd /c "cd /d ""%FRIDAY_ROOT%apps\web"" && npm run dev"

:: Wait for Next.js to boot
timeout /t 4 /nobreak >nul

:: Launch Electron shell
start "" "%FRIDAY_ROOT%electron\node_modules\.bin\electron.cmd" "%FRIDAY_ROOT%electron\main.js"
