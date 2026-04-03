@echo off
title JARVIS - Starting...
cd /d "C:\Users\12368\jarvis"

:: Start orchestrator in background
start /min cmd /c "cd apps\orchestrator && npm run dev"

:: Wait for orchestrator to start
timeout /t 3 /nobreak > nul

:: Launch JARVIS CLI
node jarvis-cli.js
