# JARVIS Windows Startup Installer
# Run this script once to add JARVIS to Windows startup

$jarvisPath = "C:\Users\12368\jarvis"
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "JARVIS.lnk"

Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       JARVIS Startup Installer             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Node.js detected: $nodeVersion" -ForegroundColor Green

# Check if orchestrator dependencies are installed
$orchestratorModules = Join-Path $jarvisPath "apps\orchestrator\node_modules"
if (-not (Test-Path $orchestratorModules)) {
    Write-Host ""
    Write-Host "Installing orchestrator dependencies..." -ForegroundColor Yellow
    Push-Location (Join-Path $jarvisPath "apps\orchestrator")
    npm install
    Pop-Location
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
}
else {
    Write-Host "✓ Orchestrator dependencies found" -ForegroundColor Green
}

# Create shortcut in Startup folder
Write-Host ""
Write-Host "Creating Windows startup shortcut..." -ForegroundColor Yellow

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/c `"$jarvisPath\start-jarvis.bat`""
$Shortcut.WorkingDirectory = $jarvisPath
$Shortcut.Description = "JARVIS - Personal AI Assistant"
$Shortcut.IconLocation = "shell32.dll,21"
$Shortcut.Save()

Write-Host "✓ Shortcut created at: $shortcutPath" -ForegroundColor Green

Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "JARVIS will now start automatically when you log in!" -ForegroundColor Green
Write-Host ""
Write-Host "To start JARVIS now, run:" -ForegroundColor White
Write-Host "  $jarvisPath\start-jarvis.bat" -ForegroundColor Yellow
Write-Host ""
Write-Host "To remove from startup, delete:" -ForegroundColor White
Write-Host "  $shortcutPath" -ForegroundColor Yellow
Write-Host ""
