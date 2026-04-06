@echo off
title JARVIS - Starting...

:: Start orchestrator in background (minimized)
start "" /MIN cmd /c "cd /d C:\Users\12368\jarvis\apps\orchestrator && npm run dev"

:: Wait for orchestrator to boot
timeout /t 3 /nobreak >nul

:: Start web app in background (minimized)
start "" /MIN cmd /c "cd /d C:\Users\12368\jarvis\apps\web && npm run dev"

:: Wait for Next.js to boot
timeout /t 4 /nobreak >nul

:: Launch Electron shell
start "" "C:\Users\12368\jarvis\electron\node_modules\.bin\electron.cmd" "C:\Users\12368\jarvis\electron\main.js"
