## Phase 2 Test Script — Tool-by-tool verification
$base = "http://localhost:3001"

function Test-Tool($name, $body) {
    Write-Host "`n=== Testing: $name ===" -ForegroundColor Cyan
    try {
        $resp = Invoke-RestMethod -Uri "$base/api/tools/execute" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 20
        $json = $resp | ConvertTo-Json -Depth 5 -Compress
        if ($json.Length -gt 500) { $json = $json.Substring(0, 500) + "..." }
        Write-Host "  SUCCESS: $json" -ForegroundColor Green
        return $true
    } catch {
        $err = $_.Exception.Message
        Write-Host "  RESULT: $err" -ForegroundColor Yellow
        return $false
    }
}

Write-Host "Phase 2 Test Checklist" -ForegroundColor Magenta
Write-Host "=====================" -ForegroundColor Magenta

# 1. Health check
Write-Host "`n=== Testing: health endpoint ===" -ForegroundColor Cyan
$h = Invoke-RestMethod -Uri "$base/api/health"
Write-Host "  SUCCESS: ok=$($h.ok) service=$($h.service)" -ForegroundColor Green

# 2. Tools count
Write-Host "`n=== Testing: tools endpoint ===" -ForegroundColor Cyan
$t = Invoke-RestMethod -Uri "$base/api/tools"
Write-Host "  SUCCESS: $($t.count) tools registered" -ForegroundColor Green

# 3. Hue — get bridge status (expect graceful error if no bridge)
Test-Tool "hue_get_bridge_status" '{"tool":"hue_get_bridge_status","parameters":{}}'

# 4. Hue — get lights (expect graceful error if no bridge)
Test-Tool "hue_get_lights" '{"tool":"hue_get_lights","parameters":{}}'

# 5. Spotify — now playing (expect graceful error if not connected)
Test-Tool "spotify_now_playing" '{"tool":"spotify_now_playing","parameters":{}}'

# 6. Spotify — status endpoint
Write-Host "`n=== Testing: spotify status ===" -ForegroundColor Cyan
$sp = Invoke-RestMethod -Uri "$base/api/spotify/status"
Write-Host "  RESULT: connected=$($sp.connected)" -ForegroundColor Green

# 7. PC Control — get system info (REAL data)
Test-Tool "get_system_info" '{"tool":"get_system_info","parameters":{}}'

# 8. PC Control — open app (Chrome)
Test-Tool "open_app (chrome)" '{"tool":"open_app","parameters":{"name":"notepad"}}'

# 9. PC Control — get active window
Test-Tool "get_active_window" '{"tool":"get_active_window","parameters":{}}'

# 10. PC Control — get mouse position
Test-Tool "get_mouse_position" '{"tool":"get_mouse_position","parameters":{}}'

# 11. Task — add
Test-Tool "task_add" '{"tool":"task_add","parameters":{"text":"call No Problem Plumbing","priority":"high"}}'

# 12. Task — list
Test-Tool "task_list" '{"tool":"task_list","parameters":{}}'

# 13. Memory — save
Test-Tool "memory_save" '{"tool":"memory_save","parameters":{"content":"Danny prefers concise responses","tags":["preference","communication"]}}'

# 14. Memory — search
Test-Tool "memory_search" '{"tool":"memory_search","parameters":{"query":"preference"}}'

# 15. Memory — get recent
Test-Tool "memory_get_recent" '{"tool":"memory_get_recent","parameters":{"limit":5}}'

# Security: test injection attempt
Write-Host "`n=== SECURITY: Injection test ===" -ForegroundColor Red
Test-Tool "open_app INJECTION" '{"tool":"open_app","parameters":{"name":"calc; Remove-Item C:\\"}}'

# Security: test blocked app
Write-Host "`n=== SECURITY: Blocked app test ===" -ForegroundColor Red
Test-Tool "open_app BLOCKED" '{"tool":"open_app","parameters":{"name":"cmd.exe"}}'

# Security: test blocked key combo
Test-Tool "key_combo BLOCKED" '{"tool":"key_combo","parameters":{"keys":"alt+f4"}}'

Write-Host "`n`n=============================" -ForegroundColor Magenta
Write-Host "Phase 2 Tests Complete" -ForegroundColor Magenta
Write-Host "=============================" -ForegroundColor Magenta
