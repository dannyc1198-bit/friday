# Start Friday and the live apps it oversees, hidden, with logs in %TEMP%.
#   powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1
# Skips anything already listening. Free sources only; no keys are added here.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$user = $env:USERPROFILE

function Listening($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Hidden($name, $port, $dir, $command, $envPairs = @{}) {
  if (Listening $port) { Write-Host "$name already on :$port"; return }
  if (-not (Test-Path $dir)) { Write-Host "$name folder missing: $dir"; return }
  $sets = ($envPairs.GetEnumerator() | ForEach-Object { "set `"$($_.Key)=$($_.Value)`" && " }) -join ""
  $log = Join-Path $env:TEMP "$name.log"
  Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -WorkingDirectory $dir -ArgumentList "/c $sets$command > `"$log`" 2>&1"
  Write-Host "$name starting on :$port (log $log)"
}

Start-Hidden "friday-orch" 3001 "$root\apps\orchestrator" "npm run dev"
Start-Hidden "friday-web" 3000 "$root\apps\web" "npm run dev"
Start-Hidden "sports" 8800 "$user\sports-dashboard" "node server.js"
# God's Eye allows Friday (port 3000) to frame its ?embed=1 view.
Start-Hidden "gods-eye" 5173 "$user\gods-eye-view" "npx vite --port 5173 --host 127.0.0.1" @{ GEV_EMBED_FRAME_ANCESTORS = "http://127.0.0.1:3000 http://localhost:3000" }
Start-Hidden "osiris" 3005 "$user\Personal-Projects\osiris" "npx next dev -p 3005"
Start-Hidden "anatomy" 5180 "$user\Personal-Projects\anatomy-atlas" "npx vite --port 5180 --host 127.0.0.1"

# Wait for Friday's web app, then open it on the right screen.
for ($i = 0; $i -lt 60 -and -not (Listening 3000); $i++) { Start-Sleep -Seconds 2 }
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "msedge" }
Start-Process $edge -ArgumentList "--user-data-dir=C:\Temp\edge-friday","--new-window","--window-position=3840,0","--start-maximized","--autoplay-policy=no-user-gesture-required","http://127.0.0.1:3000"