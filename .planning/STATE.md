# Project State

**Current branch:** `simple-friday`
**Last updated:** 2026-07-09
**Master:** untouched pre-amputation — safe fallback

## Current position — FLIGHT DECK LIVE (2026-07-09)

**The FRIDAY window was rebuilt from scratch and verified end-to-end.** New main
window = "Flight Deck" (`apps/web/src/components/deck/` + new `page.tsx`):

- Design: night-ops instrument deck — amber-on-warm-black, Chakra Petch/IBM Plex,
  signature = the **WaveformPresence** canvas (FRIDAY has no orb/face; she IS a
  wavelength — idle breath / thinking ripple / speaking dance / offline flat).
- Layout: left rail (BrainCard, HistoryCard) · center transcript-style chat with
  cognition chips (useChat untouched) · right rail (MissionCard, FleetCard,
  MarketCard, IntelCard). Every panel is a live reading or an honest OFFLINE —
  zero fabricated numbers.
- New web API routes: `/api/mission` (parses the Desktop Champion Log — THE ONE
  THING on the deck), `/api/deck/tool` (read-only allowlisted tools/execute proxy:
  fleet_status/market_snapshot/intel_news/intel_risk), `/api/deck/conversations[/:id]`.
- `useChat` gained `newConversation()` + `loadConversation()` (additive only).
- Old components/pages untouched on disk (/dashboard, /voice-conv, /gods-eye still
  route). Old main window recoverable via git.
- Verified live: page 200, chat round-trip through the UI with FLEET chip +
  streamed reply (~1.2s), tool proxy allowlist blocks non-read-only (400),
  history loads, mission parses, brain/intel/fleet real data, favicon added,
  typecheck clean.
- Backend verified same session: /api/health 40ms, TTS (ElevenLabs) live, brain
  102 notes/312 chunks, manual reflection correctly skips empty days, 71 tools.
  Reflection last auto-ran 06-19 (fleet was down 06-15→07-08); scheduler is
  running now — check `data/scheduler-state.json` after tonight's 21:30.

## Current position — BRAIN 2.0 LIVE (2026-06-10)

**Backend complete + verified live.** FRIDAY now has an Obsidian brain that learns:

- `services/brain.ts` — MiniSearch BM25 over the whole vault (85 notes → 296 heading-chunks, indexed in ~1.4s at boot, 5-min incremental rescan). Per-message vault recall injected into every chat prompt (local, $0).
- `services/reflection.ts` — nightly 21:30 reflection (scheduler): distills the day's transcripts into entity notes + Daily-note section + `FRIDAY_BRAIN/INDEX.md`. One LLM call/day.
- `tools/brain-tools.ts` — brain_recall / brain_remember / brain_status / brain_reflect (64 tools total now).
- Entity notes: `FRIDAY_BRAIN/entities/*.md`, basic-memory format (categorized dated observations + typed [[wikilink]] relations).
- `routes/brain.ts` — /api/brain/status|search|recent|reflect|reindex for the frontend.
- Bugs fixed: vapi-llm compile blocker, malformed-tool-JSON protocol bug (Gemini 400s), 90s LLM timeout, tool-round exhaustion wrap-up, array-param schemas, **startScheduler was never called** (5AM briefing never fired), learningEngine.recordOutcome now wired into every chat turn.
- **System prompt rewritten** (~2,600→~700 words): now 1:1 with real tools — the old prompt promised ~20 deleted capabilities, which was the root cause of phantom tool calls.
- Verified: real Gemini chat round-trip where the model autonomously called brain_recall and answered from vault content. brain_remember writes correct entity files.

**LLM:** Gemini 2.5-flash (FRIDAY_LLM_PROVIDER=gemini — the working free key). Groq preset added in openai.ts; switch = set GROQ_API_KEY + FRIDAY_LLM_PROVIDER=groq (llama-3.3-70b-versatile is the best free tool-caller; kimi-k2 + llama-4-maverick are deprecated on Groq).

## NEXT (resume here)

1. Confirm tonight's 21:30 auto-reflection fired (`data/scheduler-state.json`).
2. Verify Electron still loads the new deck on :3000 (deck is plain Next pages —
   should be fine, but eyeball it).
3. Optional polish: duplex voice (WS /v1/voice) surfaced as a deck mode; mobile
   layout for the rails (currently desktop-first, rails hide below xl).
4. Commit the deck (apps/web changes are uncommitted on `simple-friday` by
   design — Danny hasn't asked for a commit yet).

## Older state (pre-brain, for reference)

The 2026-04-22 entry described the post-amputation baseline: 240-LOC orchestrator, 50 tools, frozen services, Telegraf transport. Obsidian tools + learning-engine + scheduler have since been unfrozen/wired. Deleted-module list still accurate — see commit `668ec2c`.

- Orchestrator: 240 LOC (was 734), 50 tools registered (was 120+), one model (`claude-haiku-4-5`), no router, no swarm, no agent dispatch.
- Transport: standalone Telegraf bot in `apps/telegram-bot` — replaces OpenClaw as the Telegram pipe when activated.
- Docs: `CLAUDE.md` rewritten to match reality. `ACTIVATE.md` is the 5-step runbook for when credits land.

**Verified without credits:**
- typecheck clean on orchestrator + bot
- orchestrator boots in ~8s
- `/api/health` → 200
- `/v1/chat/completions` returns in <1s (surfaces real 400 instead of 126s hang)
- bot connects to Telegram API (409 vs OpenClaw polling proves auth + transport work)
- `/api/tools` returns the expected `{count, tools}` shape

**Blocked on:** Anthropic credit top-up — the paid key in `apps/orchestrator/.env` has an empty balance, so end-to-end message round-trip can't be verified.

## What was deleted (see commit for full list)

- Services: llm-router, gemini, ollama, agent-swarm, agent-dispatch, ralph-loop, intent, wavelength-context, sidecar-bridge, openclaw-bridge
- Tools (14 modules): code-generator, code-agent, self-upgrade, swarm-tools, agent-tools, sidecar-tools, openclaw-tools, danclaw-tools, wavelength-tools, business-intel, content-tools, meta-glasses-tools, screen-reader, receptionist
- Routes: Wavelength receptionist route (`routes/receptionist.ts`)
- Total: ~7,500 LOC cut

## What's frozen (on disk, not imported)

- Services: learning-engine, proactive-monitor, morning-briefing, market-monitor, alert-delivery, permission-gate, permission-manager
- Tools: hue, bluetooth, health-monitor, obsidian, health-tracking, music-tools, quiet-mode-tools, identity-tools
- Routes: confirm, proactive-alerts

Re-enable any of these by adding back the import in `apps/orchestrator/src/index.ts` or `apps/orchestrator/src/tools/index.ts`.

## Web app state

`apps/web` chat page, TTS, and startup automation all work. 6 HUD side-panels (briefing, alerts, learning, market, system, agents) will 404 silently because their orchestrator endpoints were removed — they guard with `.ok ? ... : null` so panels go empty, nothing crashes. To restore: unfreeze the corresponding services.

## Resume path when credits land

Follow `ACTIVATE.md` top-to-bottom. The short version:

1. `curl` Anthropic direct with a 1-token ping — verify the key works
2. `cd apps/orchestrator && npm run dev` — orchestrator on :3001
3. Disable `channels.telegram.enabled` in `~/.openclaw/openclaw.json`, restart OpenClaw gateway
4. `cd apps/telegram-bot && cp .env.example .env && npm run start`
5. DM the bot — watch for `[FRIDAY] cache read=XXXX` on message 2

## Older state (pre-amputation, for reference)

The prior content of this file described phases 0-9, tier routing, unwired nerve-system files, permission-gate gaps, etc. — all either cut or frozen in the amputation. If you need the history: `git log --all -- .planning/STATE.md` or check commit `2e34400` (the pre-amputation snapshot).
