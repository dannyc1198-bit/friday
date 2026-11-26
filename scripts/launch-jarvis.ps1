# JARVIS command centre — one command on Windows.
# From the friday folder:
#   powershell -ExecutionPolicy Bypass -File scripts\launch-jarvis.ps1
# The window is the production build. This does not start a Vite dev server.

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is missing. Install Node 20 or newer and run this again."
}

function Start-Hidden($name, $file, $arg) {
  Start-Process -FilePath $file -ArgumentList $arg -WorkingDirectory $root -WindowStyle Hidden -WindowTitle $name
}

if (-not (Test-Path "apps\orchestrator\node_modules")) {
  npm --prefix apps\orchestrator install
}
if (-not (Test-Path "apps\desktop\node_modules")) {
  npm --prefix apps\desktop install
}

npm --prefix apps\desktop run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

try {
  $health = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health -TimeoutSec 2
} catch { $health = $null }
if (-not $health) {
  Start-Hidden "Friday orchestrator" "cmd.exe" "/c npm --prefix apps\orchestrator run dev"
  Start-Sleep -Seconds 2
}

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
  Start-Hidden "Hey Jarvis" $python.Source "apps\sidecar\hey_jarvis.py"
}

Set-Location apps\desktop
npm start
