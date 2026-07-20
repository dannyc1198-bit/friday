# FRIDAY BRAIN — nightly deep session runner
# Fired by Windows Task Scheduler at 02:30. Pipes night-prompt.md into headless Claude Code.
$ErrorActionPreference = "Stop"

$BrainDir  = "C:\Users\12368\Obsidian\Wavelength\FRIDAY_BRAIN"
$LoopDir   = "C:\Users\12368\jarvis\scripts\brain-loop"
$LogDir    = Join-Path $LoopDir "logs"
$LockFile  = Join-Path $LoopDir ".night.lock"
$Claude    = "C:\Users\12368\AppData\Roaming\npm\claude.cmd"
$PromptFile = Join-Path $LoopDir "night-prompt.md"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }
$LogFile = Join-Path $LogDir ("night-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
function Log($msg) { ("[" + (Get-Date -Format "HH:mm:ss") + "] " + $msg) | Out-File -FilePath $LogFile -Append -Encoding utf8 }

if (Test-Path (Join-Path $BrainDir "STOP.md")) { Log "STOP.md present - skipping."; exit 0 }

if (Test-Path $LockFile) {
    $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($age.TotalMinutes -lt 180) { Log "Lock held - skipping."; exit 0 }
    Remove-Item $LockFile -Force -Confirm:$false
}
"night $PID" | Out-File $LockFile -Encoding utf8

try {
    Log "Night session starting."
    $prompt = Get-Content $PromptFile -Raw
    $out = $prompt | & $Claude -p --model sonnet --max-turns 120 `
        --allowedTools "Bash,PowerShell,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,TaskCreate,TaskUpdate,TaskList" 2>&1
    $out | Out-File -FilePath $LogFile -Append -Encoding utf8
    Log "Night session finished (exit $LASTEXITCODE)."
}
catch {
    Log ("Night ERROR: " + $_.Exception.Message)
    $ledger = Join-Path $BrainDir "memory\ACTION-LEDGER.md"
    ("- " + (Get-Date -Format "yyyy-MM-dd HH:mm") + " | ERROR | night runner crashed | " + $_.Exception.Message) |
        Out-File -FilePath $ledger -Append -Encoding utf8
}
finally {
    Remove-Item $LockFile -Force -Confirm:$false -ErrorAction SilentlyContinue
}
