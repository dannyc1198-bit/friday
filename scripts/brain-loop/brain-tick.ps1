# FRIDAY BRAIN — hourly tick runner
# Fired by Windows Task Scheduler. Pipes tick-prompt.md into headless Claude Code.
$ErrorActionPreference = "Stop"

$BrainDir  = "C:\Users\12368\Obsidian\Wavelength\FRIDAY_BRAIN"
$LoopDir   = "C:\Users\12368\jarvis\scripts\brain-loop"
$LogDir    = Join-Path $LoopDir "logs"
$LockFile  = Join-Path $LoopDir ".tick.lock"
$Claude    = "C:\Users\12368\AppData\Roaming\npm\claude.cmd"
$PromptFile = Join-Path $LoopDir "tick-prompt.md"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }
$LogFile = Join-Path $LogDir ("tick-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
function Log($msg) { ("[" + (Get-Date -Format "HH:mm:ss") + "] " + $msg) | Out-File -FilePath $LogFile -Append -Encoding utf8 }

# Kill switch — cheapest possible exit, before Claude ever starts
if (Test-Path (Join-Path $BrainDir "STOP.md")) { Log "STOP.md present - skipping."; exit 0 }

# Overlap guard — skip if another run is live (stale locks >90 min are cleared)
if (Test-Path $LockFile) {
    $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($age.TotalMinutes -lt 90) { Log "Lock held ($([int]$age.TotalMinutes)m) - skipping."; exit 0 }
    Log "Stale lock cleared."
    Remove-Item $LockFile -Force -Confirm:$false
}
"tick $PID" | Out-File $LockFile -Encoding utf8

try {
    Log "Tick starting."
    $prompt = Get-Content $PromptFile -Raw
    # allowedTools (not dangerous-skip): full shell + file + web power, no permission prompts in -p mode
    $out = $prompt | & $Claude -p --model sonnet --max-turns 40 `
        --allowedTools "Bash,PowerShell,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,TaskCreate,TaskUpdate,TaskList" 2>&1
    $out | Out-File -FilePath $LogFile -Append -Encoding utf8
    Log "Tick finished (exit $LASTEXITCODE)."
}
catch {
    Log ("Tick ERROR: " + $_.Exception.Message)
    $ledger = Join-Path $BrainDir "memory\ACTION-LEDGER.md"
    ("- " + (Get-Date -Format "yyyy-MM-dd HH:mm") + " | ERROR | tick runner crashed before/while running Claude | " + $_.Exception.Message) |
        Out-File -FilePath $ledger -Append -Encoding utf8
}
finally {
    Remove-Item $LockFile -Force -Confirm:$false -ErrorAction SilentlyContinue
}
