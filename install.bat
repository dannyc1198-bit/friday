@echo off
title JARVIS Installer
echo.
echo  ================================================
echo   J.A.R.V.I.S. — Installation
echo  ================================================
echo.

:: Verify Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install from nodejs.org first.
    pause
    exit /b 1
)

echo [1/4] Installing orchestrator dependencies...
cd /d C:\Users\12368\jarvis\apps\orchestrator
call npm install
if %errorlevel% neq 0 ( echo [ERROR] Orchestrator install failed. & pause & exit /b 1 )

echo.
echo [2/4] Installing web app dependencies...
cd /d C:\Users\12368\jarvis\apps\web
call npm install
if %errorlevel% neq 0 ( echo [ERROR] Web install failed. & pause & exit /b 1 )

echo.
echo [3/4] Installing Electron dependencies...
cd /d C:\Users\12368\jarvis\electron
call npm install
if %errorlevel% neq 0 ( echo [ERROR] Electron install failed. & pause & exit /b 1 )

echo.
echo [4/4] Registering Windows startup task (requires admin)...
cd /d C:\Users\12368\jarvis
powershell -ExecutionPolicy Bypass -File install-windows-startup.ps1

echo.
echo  ================================================
echo   Installation complete.
echo.
echo   Next steps:
echo     1. Add your API keys to apps\orchestrator\.env
echo     2. Run start-jarvis.bat to launch
echo     3. Restart PC to enable auto-start at login
echo.
echo   Controls:
echo     Backtick  - hold to talk
echo     M         - mute / unmute
echo     Alt+J     - show / hide JARVIS
echo     ESC       - minimize
echo  ================================================
echo.
pause
