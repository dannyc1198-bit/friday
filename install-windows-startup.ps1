# JARVIS Windows Startup Installer
# Registers a Task Scheduler task that launches JARVIS automatically at logon.
# Run this once as Administrator.
#
# After install:
#   - JARVIS launches automatically when you log in
#   - Alt+J to toggle visibility
#   - ESC to minimize (never closes)
#   - To uninstall: Unregister-ScheduledTask -TaskName "JARVIS" -Confirm:$false

$TaskName  = "JARVIS"
$BatPath   = "C:\Users\12368\jarvis\start-jarvis.bat"
$User      = $env:USERNAME

# Remove any previous registration
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Build task components
$action   = New-ScheduledTaskAction -Execute $BatPath
$trigger  = New-ScheduledTaskTrigger -AtLogon -User $User
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -MultipleInstances IgnoreNew

# Register — RunLevel Highest so Electron can cover the taskbar
Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -RunLevel  Highest `
    -Force

Write-Host ""
Write-Host "JARVIS startup task registered successfully." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Task name : $TaskName"
Write-Host "  Runs      : at logon for $User"
Write-Host "  Privilege : Highest (required for fullscreen over taskbar)"
Write-Host ""
Write-Host "JARVIS will launch automatically on next login." -ForegroundColor Green
Write-Host "Alt+J to toggle | ESC to minimize | close Electron window to quit." -ForegroundColor DarkGray
