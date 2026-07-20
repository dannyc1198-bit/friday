@echo off
REM Removes the FRIDAY brain loop scheduled tasks completely.
schtasks /Delete /F /TN "FRIDAY Brain Tick"
schtasks /Delete /F /TN "FRIDAY Brain Night"
echo Brain loop uninstalled. (Files and ledger are untouched.)
pause
