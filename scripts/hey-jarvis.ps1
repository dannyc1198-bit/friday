# Hey Jarvis — one command for Danny's Windows PC.
# From the friday folder:
#   powershell -ExecutionPolicy Bypass -File scripts\hey-jarvis.ps1
# Start it every sign-in:
#   powershell -ExecutionPolicy Bypass -File scripts\hey-jarvis.ps1 -Startup

param([switch]$Startup)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host ""
Write-Host "Hey Jarvis"
Write-Host "1. Checking Python."
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  Write-Host "Python is missing. Install Python 3.11 from python.org, tick Add to PATH, then run this again."
  exit 1
}
python --version

Write-Host "2. Installing voice packages. This needs internet the first time."
python -m pip install -r (Join-Path $root "apps\sidecar\requirements-voice.txt")
$ErrorActionPreference = "Continue"
python -m pip install keyboard
if ($LASTEXITCODE -ne 0) {
  Write-Host "Push-to-talk package did not install. Wake word still works."
}
$ErrorActionPreference = "Stop"

if ($Startup) {
  Write-Host "3. Adding the sign-in task Friday Hey Jarvis."
  $py = (Get-Command python).Source
  $script = Join-Path $root "apps\sidecar\hey_jarvis.py"
  $action = New-ScheduledTaskAction -Execute $py -Argument "`"$script`"" -WorkingDirectory "$root"
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName "Friday Hey Jarvis" -Action $action -Trigger $trigger -Force | Out-Null
  Write-Host "   It starts when you sign in."
  Write-Host "   Remove it later with: Unregister-ScheduledTask -TaskName 'Friday Hey Jarvis' -Confirm:`$false"
}

Write-Host ""
Write-Host "4. Listening. Start Friday first if it is not already running."
Write-Host "   Say: Hey Jarvis, play me a song."
Write-Host "   The light on the Friday dashboard shows when it is listening."
Write-Host ""
python (Join-Path $root "apps\sidecar\hey_jarvis.py")
