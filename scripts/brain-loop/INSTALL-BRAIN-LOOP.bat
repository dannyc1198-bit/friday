@echo off
REM ── FRIDAY BRAIN LOOP INSTALLER ─────────────────────────────
REM Double-click this once. It registers two Windows scheduled tasks:
REM   1. "FRIDAY Brain Tick"  — hourly, 8:00-23:00 (one small job per hour)
REM   2. "FRIDAY Brain Night" — daily 02:30 (deep session + morning briefing)
REM To remove them later: double-click UNINSTALL-BRAIN-LOOP.bat
echo.
echo Installing FRIDAY Brain Loop...
echo.

schtasks /Create /F /TN "FRIDAY Brain Tick" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\12368\jarvis\scripts\brain-loop\brain-tick.ps1" /SC DAILY /ST 08:00 /RI 60 /DU 15:00
schtasks /Create /F /TN "FRIDAY Brain Night" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\12368\jarvis\scripts\brain-loop\brain-night.ps1" /SC DAILY /ST 02:30

echo.
echo Done. The brain is ALIVE:
echo   - Hourly ticks 8am-11pm (while PC is on)
echo   - Nightly deep session at 2:30am + morning briefing in the vault
echo   - Kill switch: create STOP.md in Obsidian\Wavelength\FRIDAY_BRAIN
echo   - Rules: edit FRIDAY_BRAIN\BRAIN-RULES.md (plain English)
echo.
pause
