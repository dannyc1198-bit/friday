# Project State

**Current branch:** `simple-friday` (HEAD: `6b61e39`)
**Last updated:** 2026-04-22
**Master:** untouched pre-amputation — safe fallback

## Current position

**Code state:** simple-friday amputation complete. See commit `668ec2c` for the full audit.

- Orchestrator: 240 LOC (was 734), 50 tools registered (was 120+), one model (`claude-sonnet-4-6` with prompt caching), no router, no swarm, no agent dispatch.
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
