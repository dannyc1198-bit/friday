# Index Friday's local memory once. Add -Watch to keep incremental updates running.
# Add -Reindex after switching the local embedding model (Ollama nomic-embed-text).
param(
  [switch]$Watch,
  [switch]$Reindex
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$orchestrator = Join-Path $repoRoot "apps\orchestrator"
Set-Location $orchestrator

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is required."
}

if (-not (Test-Path "node_modules")) {
  npm install
}

if ($Reindex) {
  npm run memory:reindex
} else {
  npm run memory:index
}

if ($Watch) {
  npm run memory:watch
}
