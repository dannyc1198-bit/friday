# FRIDAY — Project Rules

## Overview

AI personal assistant with voice, tool execution, smart home control, and proactive intelligence.
10-phase build spec defined in `JARVIS-BUILD.md`. State tracked in `.planning/STATE.md`.

## Current State

- **Phase 0:** COMPLETE ✅ — "Wire the Brain" (2026-02-26)
- **Phase 1:** CODE COMPLETE ✅ — "Voice I/O" (3 manual tests deferred for Danny)
- **Phase 2:** COMPLETE ✅ — "Real Tools" (all 5 tool modules already real, cleanup done)
- **Phase 3:** CODE COMPLETE ✅ — "OpenClaw Integration" (2026-02-27)
- **Phase 4:** CODE COMPLETE ✅ — "Browser Control + Screen Awareness" (2026-02-28)
- **Unified Build:** COMPLETE ✅ — Merged 3 FRIDAY projects into one (2026-03-28)
- LLM: Anthropic Claude (`claude-sonnet-4-20250514`) — streaming verified
- ~91 tools registered across 13 categories (cut Spotify 10, Maps 5, added Sidecar 5, Agent 7)

## Project Structure

```
apps/
  orchestrator/     # Fastify 5.7.4 — port 3001 (TypeScript brain)
    src/
      config/       # System prompt, API keys, validation
      services/     # openai.ts (LLM), sidecar-bridge.ts, openclaw-bridge.ts
      tools/        # ~91 tools across 13 categories
      index.ts      # Server entry, routes, middleware
  sidecar/          # FastAPI — port 3002 (Python eyes + ears)
    plugins/        # camera, voice, kitchen_nagger, security, greeting, notifications
    main.py         # Entry point, scan loop, HTTP API
    config.py       # Shared config (reads orchestrator .env)
  web/              # Next.js 14 — port 3000 (HUD frontend)
    src/app/        # Chat UI, startup sequence
    src/components/ # CameraFeed, KitchenStatus, AgentDashboard, SystemOverview
    src/hooks/      # useChat, useSidecar, useAgents, useHealth
```

## Non-Negotiables

- Follow `JARVIS-BUILD.md` phase order. Complete each phase fully before moving on.
- Run the test checklist at the end of every phase. Never skip silently.
- Streaming responses required (SSE from orchestrator, consumed by Next.js frontend).
- Never write secrets into the repo. Use `.env` only (gitignored).
- Keep dependencies minimal. Prefer small, clean components over clever abstractions.
- No personal information in committed files (schedules, addresses, financials, watchlists).
- Security: rate limiting, CORS lockdown, input validation (4000 char), error sanitization.

## Architecture Decisions

### Anthropic Migration (Phase 0 Complete)
- `openai.ts` filename kept — 3 files import from it, minimizes churn
- `embedding.ts` stays on OpenAI (Anthropic has no embeddings API)
- System prompt: separate `system` parameter, not a message role
- Tool definitions: `parameters` → `input_schema`
- Streaming: `content_block_delta` events (not `choices[0].delta`)
- Tool calls: `tool_use` content blocks with agentic loop (MAX_TOOL_ROUNDS=10)
- Tool results: `user` message with `tool_result` content blocks
- Consecutive message merging required (Anthropic requires alternating user/assistant roles)
- Target model: `claude-sonnet-4-20250514`
- SSE headers must set CORS manually (`reply.raw.writeHead()` bypasses Fastify middleware)

### Key Exports (openai.ts)
Preserve these — other files depend on them:
- `chatCompletion` — single-turn completion
- `streamChatCompletion` — streaming with tool loop
- `checkOpenAI` — health check (rename logic, keep export name)
- `streamRawCompletion` — simple message array streaming
- `SimpleMessage` — type export

### Tool System
~91 tools across 13 categories: PC Control (13), Hue (6), Bluetooth (7), Health (5), Coding (6), System/Upgrade (5), Memory (5), Task Management (6), Integration/OpenClaw (15), Browser Control (19), Screen Reader (2), Agent Dispatch (7), Sidecar (5).
Spotify (10) and Maps (5) were CUT in the unified build. Agent + Sidecar tools were ADDED.
All registered in tool registry, converted to Anthropic `input_schema` format.

### Phase 3 Integration Tools (openclaw-tools.ts)
15 tools: web_search, web_fetch, gmail_inbox, gmail_send, gmail_search, youtube_channel_stats, notion_create, notion_search, vapi_call, file_read, file_write, shell_run, set_reminder, list_reminders, netlify_sites.
Direct API integrations where possible (Tavily, Notion, VAPI), OpenClaw bridge for OAuth services (Gmail, YouTube).
Permission gates on: gmail_send, vapi_call, shell_run (require `confirmed: true`).

### Ralph Wiggum Thinking Loop
- `ralph-loop.ts` — iterative problem-solving with self-correction
- Max iterations: 10 (default), 20 (deep think)
- Token budget tracking and cost limits
- TOKEN_COSTS updated to Claude Sonnet/Haiku pricing

## Dev Servers

```bash
# Orchestrator (port 3001)
cd apps/orchestrator && npm run dev

# Web frontend (port 3000)
cd apps/web && npm run dev
```

Launch config at `.claude/launch.json` for preview_start integration.

## Security Rules

- Rate limiting: 60 req/min on all endpoints
- CORS: locked to frontend origin only (including manual SSE headers)
- Input validation: 4000 character max per message
- Error sanitization: no stack traces or internal paths in responses
- Credentials: `.env` only, never hardcoded, never committed
- API keys required: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (embeddings only)
- Future keys: `ELEVENLABS_API_KEY`, `SPOTIFY_*`, `HUE_*` (added per phase)

## Phase Roadmap (Reference)

| Phase | Name | Key Deliverable | Status |
|-------|------|-----------------|--------|
| 0 | Wire the Brain | LLM streaming + tool execution | ✅ DONE |
| 1 | Voice I/O | TTS (ElevenLabs) + STT (Wispr Flow) | ✅ CODE COMPLETE |
| 2 | Real Tools | Hue, Spotify, PC Control, Tasks, Memory | ✅ DONE |
| 3 | Integration Bridge | Web search, email, calendar, notes | ✅ CODE COMPLETE |
| 4 | Browser + Screen | Browser control, screen awareness | ✅ CODE COMPLETE |
| 5 | Permissions | Permission system, credential vault | |
| 6 | Startup Sequence | Electron wrapper, boot animation | |
| 7 | Proactive Intelligence | Context-aware suggestions | |
| 8 | Advanced Features | Multi-modal, advanced reasoning | |
| 9 | Setup Wizard | Packaging, onboarding, distribution | |

Full spec with test checklists: `JARVIS-BUILD.md`

## Self-Learning Architecture

FRIDAY learns and adapts over time. All self-modifications require owner approval before deploying.

- **Interaction Memory:** Track tool usage patterns, frequent requests, failure modes
- **Preference Adaptation:** Auto-tune parameters (volume, brightness, response style) based on learned patterns
- **Self-Improvement Proposals:** FRIDAY can draft new tool files, prompt adjustments, or config changes — but presents them for approval, never auto-deploys
- **Upgrade Suggestions:** Existing `self-upgrade.ts` module proposes capability expansions
- **Approval Gate (mandatory):** No self-generated change goes live without explicit sign-off. FRIDAY proposes → owner approves → change deploys.

Evolution roadmap: `.planning/JARVIS.md`

## Output Style

Learning mode: educational insights + interactive contributions. Before/after writing code, provide brief `★ Insight` blocks. Identify opportunities for meaningful user input (5-10 lines) on business logic, architecture choices, and trade-offs.
