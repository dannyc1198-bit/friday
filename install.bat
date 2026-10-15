@echo off
setlocal
title FRIDAY Installer
set "ROOT=%~dp0"

echo.
echo  ================================================
echo   F.R.I.D.A.Y. — Installation
echo  ================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org/ first.
    pause
    exit /b 1
)

echo [1/3] Installing orchestrator dependencies...
cd /d "%ROOT%apps\orchestrator"
call npm install
if errorlevel 1 (
    echo [ERROR] Orchestrator install failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Installing web app dependencies...
cd /d "%ROOT%apps\web"
call npm install
if errorlevel 1 (
    echo [ERROR] Web install failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Installing Electron dependencies...
cd /d "%ROOT%electron"
call npm install
if errorlevel 1 (
    echo [ERROR] Electron install failed.
    pause
    exit /b 1
)

echo.
if not exist "%ROOT%apps\orchestrator\.env" (
    copy /Y "%ROOT%apps\orchestrator\.env.example" "%ROOT%apps\orchestrator\.env" >nul
    echo Created apps\orchestrator\.env from .env.example. Fill in the keys you have.
)
if not exist "%ROOT%apps\web\.env.local" (
    copy /Y "%ROOT%apps\web\.env.example" "%ROOT%apps\web\.env.local" >nul
    echo Created apps\web\.env.local from .env.example.
)

echo.
echo  ================================================
echo   Installation complete.
echo.
echo   Next:
echo     1. Edit apps\orchestrator\.env  ^(see SETUP-WINDOWS.md^)
echo     2. Run start-unified.bat  or  start-jarvis.bat
echo     3. Optional logon task, from an elevated PowerShell:
echo        powershell -ExecutionPolicy Bypass -File "%ROOT%install-windows-startup.ps1"
echo  ================================================
echo.
pause
endlocal
