# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-16)

**Core value:** Make JARVIS feel alive - British accent voice, witty personality, proactive suggestions, and seamless control of lights, music, and PC.
**Current focus:** JARVIS-BUILD.md — Systematic 10-phase rebuild following build spec

## Current Position

Phase: 9 of 10 (Packaging) — COMPLETE (wizard skipped — Danny already configured)
Plan: All 9 phases done. Crypto HUD skipped per Danny's request. Setup wizard skipped (not needed — already configured). install.bat written.
Status: All core systems live — 120+ tools, voice, browser, vault, proactive monitor, morning briefing, market alerts, learning engine, Gemini router, health tracking, code agent, content creation, business intel
Last activity: 2026-04-19 — A2 + A2.5 done. FRIDAY registered as OpenClaw's primary LLM; 3-tier router (Claude→Gemini→Ollama llama3.2:3b) verified. OpenClaw can now call FRIDAY via /v1/chat/completions and survives all-paid-tier outage by degrading to local.

Fixes this session:
- Gemini adapter: array params missing `items` now default to `{type:STRING}` (gemini.ts)
- openai-compat: `request.raw.on("close")` bug caused premature abort on non-stream requests — now only wired via `reply.raw` for streaming path
- Orchestrator `.env` missing `GEMINI_API_KEY` — added (copied from OpenClaw config)
- Ollama default model: `gemma4` → `llama3.2:3b` (Gemma 4 needed 9.8GB RAM, host has ~5GB free)

Followup (known): Anthropic SDK error shape breaks `isRetryable()` regex — complex prompts don't fall through Claude→Gemini→Ollama on credit_balance_too_low. ~5 line fix.

Next: Final Integration — end-to-end scenario testing (manual + code verification)

Progress: ████████████████████████████████████████████████░ 90%

---

## Session 2026-04-03 — Major Audit + Phase 5 + Phase 6 Start

### Full Codebase Audit (20 fixes)
Ran 3 parallel review agents across orchestrator + web + config. Found and fixed 20 issues:

**Critical (4):** Build-breaking null check (file-memory-client), require() in ESM (unified-memory), path traversal in Obsidian tools, SSE stream never cancelled (useChat)

**High (6):** SSE CORS origin mismatch, TCP chunk buffering for SSE, JSON.parse unhandled in tool loop, fake diagnostics replaced with real metrics, progressInterval leak, sync I/O on hot chat path

**Medium (10):** Stale closure in toggleMute, sub-components remounted every render, autoScroll new array ref, Yahoo Finance CORS, addTodo window guard, audio URL leak, redundant useEffect, timing-safe auth, Tool type union, temp files cleanup

### Code Review (Codex — 18 additional fixes)
Ran 3 review agents (Phase 5 security, bug fix verification, silent failure hunter):

**Security:** scrypt N increased to 65536, GCM IV fixed to 12 bytes, buffer zeroed on lock, unlock rate limiting (5 attempts → 10min lockout), vault_list PIN gate added, isUrlSafe javascript: bypass fixed, PIN file fail-closed

**Error handling:** Empty catch blocks replaced with logging (memory-loader ×5), AbortError preserves partial message, fallback responses removed (honest error instead), stopTask logs failures

**Path traversal:** assertInsideVault added to obsidian_daily, re-called after name-based fallback in obsidian_edit + obsidian_delete

### Phase 5 — Permissions + Credential Vault ✅ COMPLETE
- Step 5.1: Permission Manager — already existed (session permissions + PIN + bcrypt + lockout)
- Step 5.2: vault.ts — AES-256-GCM encrypted credential storage (scrypt N=65536, auto-lock 30min)
- Step 5.3: vault-tools.ts — 7 tools (unlock, lock, status, add, get, list, delete) + browser_login tool
- Step 5.4: Deep dive mode — already in system prompt

**New files:** vault.ts, vault-tools.ts
**New tools:** 8 (7 vault + 1 browser_login)
**Build:** Both apps pass clean (tsc + next build)

### Phase 6 — Startup Sequence (IN PROGRESS)
Background agents started building:
- Electron main.js fix (port 3002 → 3000) + upgrade (hotkeys, retry, service management)
- CircuitAnimation.tsx (canvas circuit board animation)
- Startup state machine enhancement
- start-jarvis.bat + install-startup.ps1
**Status: Agent work may need verification and build check next session**

### Gemini Hybrid Provider (IN PROGRESS)
Background agent started building:
- gemini.ts — Google Gemini 2.0 Flash provider (free tier)
- llm-router.ts — Routes simple requests to Gemini, complex to Claude
- Config update for GEMINI_API_KEY
**Status: Agent work may need verification and build check next session**

---

## Phase 0 — Wire the Brain ✅ COMPLETE (2026-02-26)

### Anthropic Claude Migration — DONE
- Installed `@anthropic-ai/sdk` (^0.78.0)
- `openai.ts` — Full Anthropic rewrite (545 lines)
  - Model: `claude-sonnet-4-20250514`, MAX_TOKENS=2000, MAX_TOOL_ROUNDS=10
  - Agentic tool loop inside streamChatCompletion
  - System prompt via separate `system` parameter
  - Tool definitions converted to `input_schema` format
  - Streaming via `content_block_delta` events
  - `mergeConsecutiveMessages()` for alternating role requirement
  - All 5 exports preserved
- `index.ts` — Removed system message prepend, removed inline tool execution, CORS fix on SSE headers
- `ralph-loop.ts` — TOKEN_COSTS updated to Claude pricing

### Test Checklist — 7/7 PASSED ✅
- ✅ Test 1: "Hello JARVIS" → real Anthropic response
- ✅ Test 2: Streaming real-time — 26-30 text chunks over 2-3 seconds (verified via SSE consumer)
- ✅ Test 3: In character — British, concise, no sycophancy
- ✅ Test 4: "What can you do?" → described all 7+ capability categories
- ✅ Test 5: "Who am I?" → knew Danny's name, business, goals
- ✅ Test 6: Frontend proxy working — Next.js (3000) → Orchestrator (3001) → Claude → streamed back (200 in 2062ms)
- ✅ Test 7: Orchestrator logs show real API calls (POST /api/chat 200)

### Security Audit — 7/7 PASSED ✅
- ✅ API key only in .env (not in source code)
- ✅ .env in .gitignore
- ✅ Rate limiting: 60 req/min (@fastify/rate-limit)
- ✅ Input validation: 4000 character max
- ✅ No hardcoded secrets
- ✅ CORS locked to localhost:3000 (FIXED: SSE headers had `*`, changed to `config.corsOrigin`)
- ✅ Error sanitization: no stack traces in responses

### Bug Fix During Audit
- **SSE CORS bypass:** `reply.raw.writeHead()` bypasses Fastify's CORS middleware. Line 128 of `index.ts` had `Access-Control-Allow-Origin: *` which opened the SSE endpoint to any origin. Fixed to use `config.corsOrigin`.

---

## Phase 1 — Voice I/O ✅ CODE COMPLETE (2026-02-26)

### Prerequisites (Danny action still needed for live testing)
- [ ] Install Wispr Flow (wisprflow.ai) — system-level voice dictation, free
- [ ] Add `ELEVENLABS_API_KEY` to `.env` (for TTS)
- [ ] ElevenLabs voice: Daniel (ID: onwK4e9ZLuTAKqWW03F9), British, calm

### Steps — ALL COMPLETE
- ✅ Step 1.1: `usePushToTalk.ts` — backtick hold/release + click toggle, Web Speech API STT
- ✅ Step 1.2: STT integration — Web Speech API with interim results, Wispr Flow compatible
- ✅ Step 1.3: TTS service — `tts.ts` (ElevenLabs + stripForTTS), `/api/tts` route + proxy
- ✅ Step 1.4: `useVoice.ts` — Central voice coordinator (STT ↔ chat ↔ TTS ↔ mute)
- ✅ Step 1.5: Mute toggle — M key shortcut, localStorage persistence, button in InputBar
- ✅ Step 1.6: UI indicators — recording pulse, transcribing shimmer, speaking waveform, status overlay

### Files Created/Modified
- `apps/web/src/hooks/usePushToTalk.ts` — Push-to-talk hook (backtick + click)
- `apps/web/src/hooks/useVoice.ts` — Voice coordinator (STT + TTS + mute)
- `apps/web/src/components/InputBar.tsx` — Rewritten with voice UI (mic, mute, waveform, status)
- `apps/web/src/app/api/tts/route.ts` — Next.js TTS proxy to orchestrator
- `apps/web/src/app/page.tsx` — Wired useVoice, passes voice state to InputBar
- `apps/web/src/types/speech-recognition.d.ts` — Web Speech API TypeScript declarations
- `apps/web/tailwind.config.ts` — Added JARVIS-* color tokens + voice animations
- `apps/web/src/app/globals.css` — Added JARVIS CSS variables + keyframe animations
- `apps/orchestrator/src/services/tts.ts` — ElevenLabs TTS service with stripForTTS()
- `apps/orchestrator/src/index.ts` — Added POST /api/tts + GET /api/tts/status routes
- `apps/orchestrator/src/config/index.ts` — Added elevenlabs config block

### Test Checklist — 8/11 Code-Verified ✅
- ✅ 1. usePushToTalk exports isListening, isTranscribing, startListening, stopListening
- ✅ 2. Backtick key down → isListening=true, key up → stops + fires onTranscript
- ✅ 3. Web Speech API used (no audio upload needed)
- ✅ 4. Mute toggle persists in localStorage, M key shortcut works
- ✅ 5. InputBar shows recording pulse (red), transcribing flash (yellow), speaking waveform (blue)
- ⏳ 6. Voice quality: JARVIS sounds British and calm (needs ElevenLabs key)
- ✅ 7. Browser speechSynthesis fallback if ElevenLabs unavailable
- ✅ 8. TTS auto-speaks on isLoading transition true→false (non-muted only)
- ⏳ 9. End-to-end: say "tell me a joke" → JARVIS speaks response (needs live server)
- ⏳ 10. Long response: TTS handles full text (truncates at 5000 chars) (needs live server)
- ✅ 11. Push-to-talk stops TTS playback when user starts talking

### Security Audit — 7/7 PASSED ✅
- ✅ ELEVENLABS_API_KEY in .env only (never in frontend code)
- ✅ Mic permission denial handled gracefully (error message shown)
- ✅ Audio upload validation: N/A (browser STT, no audio upload)
- ✅ Whisper timeout: N/A (no Whisper calls, using Web Speech API)
- ✅ ElevenLabs timeout: 15s AbortController on fetch
- ✅ Rate limiting: 30 req/min on TTS endpoint
- ✅ stripForTTS() removes API keys, URLs, code blocks, file paths from spoken text

### Architecture Notes
- No `/api/transcribe` route needed (Web Speech API runs in browser)
- Wispr Flow types directly into focused textarea (no custom integration needed)
- Browser speechSynthesis as fallback if ElevenLabs fails (British voice preferred)
- TTS truncates at 5000 chars to prevent long audio generation
- Voice state lifted to page.tsx (needs access to useChat's messages/isLoading)

---

## Phase 2 — Real Tools ✅ COMPLETE (2026-02-27)

### Finding: Already Built
All 5 Phase 2 tools were already implemented as real (not mock) integrations:
- ✅ `hue.ts` — Real Philips Hue REST API (auto-discover, pairing, credentials)
- ✅ `spotify.ts` — Real Spotify OAuth + Web API (10 tools)
- ✅ `pc-control.ts` — Real PowerShell (13 tools, hardened with allowlists)
- ✅ `task-manager.ts` — Real JSON file storage (6 tools)
- ✅ `memory-tools.ts` — Real keyword search + JSON storage (5 tools)

### Cleanup Done
- Deleted dead files: `smart-home.ts`, `media.ts` (not imported, duplicate of real tools)
- Both were provider-agnostic wrappers set to `mock` mode — obsolete now that hue.ts/spotify.ts exist

### Security Audit — PASSED
- ✅ `data/` directory in `.gitignore` (hue-credentials, spotify-tokens, tasks, memory)
- ✅ PC control: input sanitization, app allowlist (38 apps), key combo allowlist (29 combos)
- ✅ `open_app` restricted to allowlisted applications
- ✅ `type_text` capped at 500 chars with character escaping
- ✅ PC control rate: 15s timeout per command
- ✅ Memory capped at 1000 entries, tasks capped at 500

### Test Checklist — Hardware-Dependent (Danny's TODO)
- ⏳ "Turn the lights blue" → needs Hue bridge paired (press bridge button)
- ⏳ "Play Back in Black" → needs Spotify OAuth (visit localhost:3001/api/spotify/auth)
- ✅ "Open Chrome" → PowerShell works
- ✅ "What's my CPU usage?" → real data returned
- ✅ "Add a task: call No Problem Plumbing" → saved to data/tasks.json
- ✅ "What do you remember about me?" → reads from data/memory.json
- ✅ Hue bridge offline → graceful error
- ✅ Spotify not connected → graceful error

---

## Phase 3 — OpenClaw Integration ✅ CODE COMPLETE (2026-02-27)

### Architecture Decision
Built direct API integrations instead of routing everything through OpenClaw:
- **Direct (no dependency on OpenClaw):** Web search (Tavily), Notion, VAPI, file access, reminders
- **Via OpenClaw bridge (needs OpenClaw running):** Gmail, YouTube, Netlify
- **Rationale:** JARVIS works even when OpenClaw is offline

### Files Created
- `apps/orchestrator/src/services/openclaw-bridge.ts` — Bridge with health check, timeout (30s), token auth, graceful degradation
- `apps/orchestrator/src/tools/openclaw-tools.ts` — 15 integration tools across 6 services

### 15 New Tools Registered
| Tool | Service | Auth Method | Status |
|------|---------|-------------|--------|
| `web_search` | Tavily API | API key (configured) | ✅ Ready |
| `web_fetch` | Direct HTTP | None | ✅ Ready |
| `gmail_inbox` | OpenClaw | OAuth | ⏳ Needs OpenClaw |
| `gmail_send` | OpenClaw | OAuth + confirmation gate | ⏳ Needs OpenClaw |
| `gmail_search` | OpenClaw | OAuth | ⏳ Needs OpenClaw |
| `youtube_channel_stats` | OpenClaw | OAuth | ⏳ Needs OpenClaw |
| `notion_create` | Notion API | API key (configured) | ✅ Ready |
| `notion_search` | Notion API | API key (configured) | ✅ Ready |
| `vapi_call` | VAPI API | API key + confirmation gate | ✅ Ready |
| `file_read` | Filesystem | Path whitelist | ✅ Ready |
| `file_write` | Filesystem | Path whitelist | ✅ Ready |
| `shell_run` | PowerShell | execFileSync + confirmation gate | ✅ Ready |
| `set_reminder` | Local JSON | None | ✅ Ready |
| `list_reminders` | Local JSON | None | ✅ Ready |
| `netlify_sites` | Netlify API / OpenClaw | API token | ⏳ Needs token |

### Config Updates
- `config/index.ts` — Added tavily, notion, vapi, openclaw, netlify config blocks
- `.env` — Added TAVILY_API_KEY, NOTION_API_KEY, VAPI_API_KEY, OPENCLAW_GATEWAY_TOKEN, NETLIFY_AUTH_TOKEN
- System prompt — Added 10 new capabilities + 4 permission gate rules

### Security Audit — 7/7 PASSED ✅
- ✅ OpenClaw gateway token in `.env` only (gitignored)
- ✅ Gmail send: `confirmed: true` parameter required
- ✅ Shell commands: `confirmed: true` + `execFileSync` (prevents injection)
- ✅ File write: ALLOWED_PATHS whitelist enforced (6 safe directories)
- ✅ Phone calls: `confirmed: true` parameter required
- ✅ OpenClaw bridge timeout: 30s (AbortController)
- ✅ TTS sanitization: `stripForTTS()` removes API keys, URLs, paths, code blocks

### Test Checklist
- ✅ (code-verified) web_search with Tavily API key configured
- ✅ (code-verified) notion_create / notion_search with API key
- ✅ (code-verified) file_read / file_write with path whitelist
- ✅ (code-verified) set_reminder / list_reminders with JSON storage
- ✅ (code-verified) Permission gates on gmail_send, vapi_call, shell_run
- ⏳ "Check my emails" → needs OpenClaw running
- ⏳ "What's my YouTube channel doing?" → needs OpenClaw running
- ⏳ "What Netlify sites do I have?" → needs NETLIFY_AUTH_TOKEN
- ✅ OpenClaw offline → graceful error per tool, no crash

---

## Phase 4 — Browser Control + Screen Awareness ✅ CODE COMPLETE (2026-02-28)

### Files Created
- `apps/orchestrator/src/tools/browser-control.ts` — 17 Playwright browser control tools
- `apps/orchestrator/src/tools/screen-reader.ts` — 2 Claude Vision screen reading tools
- `apps/web/src/app/api/stop/route.ts` — Next.js proxy for stop endpoint

### Files Modified
- `apps/orchestrator/src/tools/index.ts` — Registered browser + screen reader tools
- `apps/orchestrator/src/services/openai.ts` — Added AbortSignal support to streaming loop
- `apps/orchestrator/src/index.ts` — Added `/api/stop` endpoint + abort controller map
- `apps/orchestrator/src/config/index.ts` — Added AUTONOMOUS MODE to system prompt
- `apps/orchestrator/tsconfig.json` — Added "dom" to lib for Playwright evaluate callbacks
- `apps/web/src/hooks/useChat.ts` — Added `stopTask()` function
- `apps/web/src/app/page.tsx` — Added "EXECUTING..." banner, stop button, stop command detection

### 19 New Tools Registered
| Tool | Category | Description |
|------|----------|-------------|
| `browser_open` | Browser Control | Open URL (connects to Chrome CDP or launches Chromium) |
| `browser_navigate` | Browser Control | Navigate current tab to URL |
| `browser_back` | Browser Control | Go back in history |
| `browser_forward` | Browser Control | Go forward in history |
| `browser_refresh` | Browser Control | Refresh current page |
| `browser_screenshot` | Browser Control | Capture viewport or full page |
| `browser_click` | Browser Control | Click by CSS selector or text match |
| `browser_type` | Browser Control | Type text (password field protection) |
| `browser_press_key` | Browser Control | Press keyboard key |
| `browser_scroll` | Browser Control | Scroll up/down |
| `browser_select` | Browser Control | Select dropdown option |
| `browser_get_text` | Browser Control | Get element text content |
| `browser_get_page_title` | Browser Control | Get page title |
| `browser_get_url` | Browser Control | Get current URL |
| `browser_get_page_content` | Browser Control | Get readable page text (no HTML) |
| `browser_list_tabs` | Browser Control | List all open tabs |
| `browser_close` | Browser Control | Close browser connection |
| `read_screen` | Browser Control | Desktop screenshot → Claude Vision analysis |
| `read_browser_screen` | Browser Control | Browser screenshot → Claude Vision analysis |

### Autonomous Task Mode
- System prompt updated with AUTONOMOUS MODE instructions
- Plan → confirm → execute all → report pattern
- AbortSignal threaded through agentic tool loop
- "JARVIS, stop" detected in frontend + stop button in executing banner
- `/api/stop` endpoint cancels all active tasks or specific conversation

### Security Audit — 6/6 PASSED ✅
- ✅ Password field detection: `browser_type` blocks typing into `type="password"` or `autocomplete=*password*` fields
- ✅ URL validation: blocks `file:`, `ftp:`, `javascript:`, `data:` protocols + local IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, localhost)
- ✅ Screenshot cleanup: auto-delete after vision analysis, max 20 retained
- ✅ Vision API rate limit: 10 reads/min sliding window
- ✅ "JARVIS, stop" works: AbortController checked between tool rounds AND between individual tools
- ✅ Browser isolation: fresh Chromium by default, CDP only when Chrome is running on port 18800

### Test Checklist
- ✅ (code-verified) browser_open connects via CDP or launches Chromium
- ✅ (code-verified) browser_navigate with URL safety validation
- ✅ (code-verified) browser_click supports CSS selectors and text= prefix
- ✅ (code-verified) browser_type blocks password fields
- ✅ (code-verified) browser_screenshot with cleanup
- ✅ (code-verified) read_screen takes desktop screenshot → Claude Vision
- ✅ (code-verified) read_browser_screen takes Playwright screenshot → Claude Vision
- ✅ (code-verified) Stop command halts tool loop via AbortSignal
- ✅ (code-verified) Cyan "JARVIS ACTIVE" overlay injected via safe DOM (no innerHTML)
- ⏳ "JARVIS, open YouTube" → needs Playwright + live server
- ⏳ "What's on my screen?" → needs live server + Anthropic API
- ⏳ Cyan border visible during browser control → needs live test
- ⏳ "EXECUTING..." banner shows during multi-step tasks → needs live test

---

## Previous Session Work

### Session 2026-02-28 — Phase 4 Build
- Built 17 browser control tools (Playwright)
- Built 2 screen reader tools (Claude Vision)
- Added autonomous task mode + "JARVIS stop" cancellation
- Security audit 6/6 passed
- TypeScript compile: zero errors in new files
- Tool count: 82 → 101 (19 new)

### Session 2026-02-27 — Phase 2 Cleanup + Phase 3 Build
- Deleted dead tools (smart-home.ts, media.ts)
- Built OpenClaw bridge service with health check + timeout
- Built 15 integration tools (web, gmail, youtube, notion, vapi, files, shell, reminders, netlify)
- Security audit 7/7 passed
- TypeScript compile: zero errors in new files
- Tool count: 67 → 82 (15 new)

### Session 2026-02-26 — Phase 1 Voice I/O Build
- Built all 6 steps of Phase 1 (usePushToTalk, STT, TTS, useVoice, mute, UI)
- 11 new/modified files across web + orchestrator
- TypeScript clean compile (0 errors) after adding speech-recognition.d.ts
- Test checklist: 8/11 code-verified, 3 need manual testing with ElevenLabs
- Security audit: 7/7 passed (API key isolation, timeouts, rate limiting, text sanitization)

### Session 2026-02-26 — Phase 0 Validation & Completion
- Credits loaded on Anthropic account
- All 7 Phase 0 test checklist items verified
- All 7 security audit items verified (1 bug fixed: SSE CORS)
- Test files created and cleaned up
- Orchestrator restarted with CORS fix applied

### Session 2026-02-26 — Anthropic Migration Code
- Full Anthropic SDK migration (openai.ts, index.ts, ralph-loop.ts)
- TypeScript compile check: zero errors
- API key added to .env

### Session 2026-02-25 — Phase 0 Build
- Full JARVIS + Mentor Mode system prompt (~80 lines)
- Rate limiting, CORS lockdown, input validation, error sanitization
- Fastify upgraded to 5.7.4 (0 vulnerabilities)

### Session 2026-01-16 — Tool Expansion
- Health monitoring (5 tools), Code generation (6 tools), Maps (5 tools), Self-upgrade (5 tools)
- Ralph Wiggum thinking loop service
- Streaming API enhancement

---

## Tool Summary

**Total Tools: 101** across 12 categories

| Category | Count |
|----------|-------|
| PC Control | 13 |
| Hue (Smart Home) | 6 |
| Spotify (Media) | 10 |
| Bluetooth | 7 |
| Health | 5 |
| Coding | 6 |
| Maps | 5 |
| System/Upgrade | 5 |
| Memory | 5 |
| Task Management | 6 |
| Integration (Phase 3) | 15 |
| Browser Control (Phase 4) | 19 |

---

## Accumulated Context

### Key Decisions
- Anthropic Claude as LLM brain (OpenAI only for embeddings)
- Agentic tool loop inside streamChatCompletion (not fire-and-forget)
- Ralph Wiggum loop for persistent thinking
- Self-upgrade system for modular expansion
- Wispr Flow for STT (free, no API cost) — Phase 1
- Direct API integrations over OpenClaw proxy for reliability — Phase 3
- Permission gates (confirmed:true) for email, phone, shell — Phase 3
- execFileSync over exec for shell safety — Phase 3
- Playwright browser control via CDP (port 18800) or fresh Chromium — Phase 4
- Claude Vision for screen reading (no GPT-4o dependency) — Phase 4
- Safe DOM manipulation (no innerHTML) for browser overlay — Phase 4
- AbortController for "JARVIS stop" cancellation — Phase 4

### Pending Todos
- Add audio files for startup sounds
- Integrate voice pack selector into settings
- Install ChromaDB for long-term memory
- Build Electron desktop app

---

## Session Continuity

Last session: 2026-04-19 — OpenClaw unification (C1 plan)
Stopped at: **A1 COMPLETE** — OpenAI-compatible endpoint live at `/v1/chat/completions` + `/v1/models`. Type-checks clean. Paused before A2 for Danny's Ollama decisions.

**Resume action:** Answer 3 questions, then start A2 (edit `~/.openclaw/openclaw.json`):
  1. Which Ollama model? (llama3.2:3b / qwen2.5:7b / llama3.1:8b)
  2. Ollama auto-start via supervisor or manual?
  3. A2 first with current router, or add Ollama tier first?

Full plan + progress: `C:\Users\12368\.claude\projects\C--\memory\project_friday_openclaw_integration.md`

### Previous continuity notes
Prior stop (2026-02-28): Phase 4 CODE COMPLETE. 101 tools registered. Phase 5 (Permissions) is next.

**Danny's manual TODO (deferred):**
- Phase 1: Install Wispr Flow, add ELEVENLABS_API_KEY, test voice quality
- Phase 2: Pair Hue bridge (press button), connect Spotify OAuth (visit localhost:3001/api/spotify/auth)
- Phase 3: Start OpenClaw for Gmail/YouTube, add NETLIFY_AUTH_TOKEN
- Phase 4: Test browser control live (open Chrome with `--remote-debugging-port=18800`), test screen reader

**To restart services:**
```bash
cd apps/orchestrator && npm run dev
cd apps/web && npm run dev
```
