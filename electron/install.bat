@echo off
echo Installing ULTRON Desktop...
cd /d "%~dp0"
npm install
echo.
echo Registering ULTRON to launch on Windows login...
node register-startup.js
echo.
echo Done! ULTRON will launch automatically on next login.
pause
