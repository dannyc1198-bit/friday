# FRIDAY — Project Rules

AI personal assistant: voice, tool execution, smart-home control, browser control, proactive intelligence (frozen but on disk).

> **Current branch matters.** If you're on `simple-friday` (default for ongoing work), read this file. `master` is the pre-amputation version — different architecture, much bigger. `git branch --show-current` first.

---

## Current State (2026-04-21, `simple-friday` branch)

**Amputated down from ~18K LOC of orchestrator code to ~3.6K LOC.** See `.planning/STATE.md` and commit `668ec2c` for the full audit.

- **LLM:** Anthropic Claude `claude-sonnet-4-6` with prompt caching. System prompt + tool schemas are cached (`cache_control: ephemeral`); per-turn memory context rides in a separate uncached block so it never invalidates the prefix.
- **Tools:** 50 registered from 5 modules (pc-control, memory-tools, task-manager, vault-tools, browser-control). Eight more modules are **frozen** — on disk but unregistered (hue, bluetooth, health-monitor, obsidian, health-tracking, music-tools, quiet-mode-tools, identity-tools).
- **Services deleted:** llm-router, gemini, ollama, agent-swarm, agent-dispatch, ralph-loop, intent, wavelength-context, sidecar-bridge, openclaw-bridge.
- **Services frozen:** learning-engine, proactive-monitor, morning-briefing, market-monitor, alert-delivery, permission-gate. Files on disk, not imported from `index.ts`.
- **Transport:** Direct Telegraf bot in `apps/telegram-bot` posts to `/v1/chat/completions`. OpenClaw is no longer the Telegram pipe (toggle it off in `~/.openclaw/openclaw.json` when activating the new bot — they share a token).

**Known gaps:** `apps/web` has 6 HUD side-panels (briefing, proactive alerts, learning, market, system, agents) that 404 silently because their endpoints were removed. Chat page is fully functional. Re-enable panels by unfreezing their corresponding services.

---

## Project Structure

```
apps/
  orchestrator/       # Fastify — port 3001 (TypeScript brain)
    src/
      config/         # System prompt, API keys
      services/       # openai.ts (LLM + caching), conversation, tts,
                      # memory/, unified-memory, memory-loader, vault,
                      # identity, scheduler, permission-manager
                      # (+ frozen: learning-engine, proactive-monitor,
                      #  morning-briefing, market-monitor, alert-delivery,
                      #  permission-gate)
      tools/          # 5 registered + 8 frozen
      routes/         # friday-phone, openai-compat
                      # (+ frozen: confirm, proactive-alerts)
      index.ts        # 240 LOC entry
  telegram-bot/       # Telegraf — standalone, polls Telegram, posts to :3001
  web/                # Next.js 14 — port 3000 (HUD frontend)
  sidecar/            # FastAPI — port 3002 (Python eyes + ears) — status unverified on simple-friday
```

---

## Non-Negotiables

- **Separate "wired" from "verified end-to-end."** Code that imports and boots is not the same as code that answers a real request. Check end-to-end before declaring something done.
- **Don't re-introduce tier routing.** One model, one path. If you feel tempted to add Gemini/Ollama fallback, talk to Danny first — the last router is what hid the credit-balance 400 behind a 126s hang.
- **Prompt caching invariant:** render order is `tools → system → messages`. Never interpolate a timestamp, UUID, or session-varying field into `FRIDAY_SYSTEM_PROMPT` or into the tool list. All volatile context must ride in the second system block (no `cache_control`) or as message content.
- **Never write secrets into the repo.** `.env` only, gitignored. `apps/orchestrator/.env` has `ANTHROPIC_API_KEY` and `FRIDAY_API_KEY`; `apps/telegram-bot/.env` has the bot token + allowlist.
- **Rate limiting, CORS, input validation, error sanitization** — all in `apps/orchestrator/src/index.ts`. Preserve on any rewrites.

---

## Architecture Decisions

### Anthropic SDK (preserve)

- `openai.ts` filename kept to minimize import churn (only `index.ts` and `routes/openai-compat.ts` import from it now).
- System prompt goes in the separate `system` parameter, NOT as a message role.
- Tool definitions: `parameters` → `input_schema`.
- Streaming: `content_block_delta` events.
- Tool calls: `tool_use` content blocks with agentic loop (`MAX_TOOL_ROUNDS=10`).
- Tool results: `user` message with `tool_result` content blocks.
- Anthropic requires alternating user/assistant roles — `mergeConsecutiveMessages()` in `openai.ts` handles this.
- SSE headers must be set manually via `reply.raw.writeHead()` (Fastify middleware doesn't reach raw writes).

### Prompt caching (added 2026-04-21)

- `buildSystemBlocks(extras)` in `openai.ts` returns a two-block system array: stable `FRIDAY_SYSTEM_PROMPT` (with `cache_control: ephemeral`) and optional volatile extras (no cache_control).
- Tools cache together with system (they render first). Cache breakpoint on the last system block covers both.
- Verify hits via `finalMessage.usage.cache_read_input_tokens` — logged on round 0 of every request as `[FRIDAY] cache read=X write=Y uncached=Z`.
- Minimum cacheable prefix on Sonnet 4.6 is 2048 tokens. `FRIDAY_SYSTEM_PROMPT` + 50 tool schemas clears that easily.

### Exports from `openai.ts`

Only two, both used:
- `streamChatCompletion(messages, signal?, extras?)` — agentic streaming with tool loop
- `checkOpenAI()` — health check

`chatCompletion`, `streamRawCompletion`, and `SimpleMessage` were removed — their only callers (ralph-loop, agent-dispatch) are deleted.

### Tool system

50 tools across 5 modules. Register in `apps/orchestrator/src/tools/index.ts`. Frozen modules stay on disk — to re-enable, add back their `registerXTools()` call and import.

---

## Dev Servers

```bash
# Orchestrator (port 3001)
cd apps/orchestrator && npm run dev

# Web frontend (port 3000)
cd apps/web && npm run dev

# Telegram bot (polling)
cd apps/telegram-bot && cp .env.example .env && npm run start
```

On Windows, memory note says to prefer `cmd` shell over PowerShell for npm wrapper scripts.

---

## Model Migration Notes (2026-04-21)

- Changed from `claude-sonnet-4-20250514` to `claude-sonnet-4-6`. Reason: 4-20250514 is the old ID format; `claude-sonnet-4-6` is the current active Sonnet with adaptive-thinking support.
- If upgrading to Opus 4.7: `thinking: {type: "adaptive"}` required; `budget_tokens`, `temperature`, `top_p`, `top_k` all return 400 on 4.7. Tool-input JSON may have different escaping — always parse with `JSON.parse()`, never string-match.

---

## Security

- Rate limiting: 60 req/min on all endpoints, 30 req/min on `/api/tts`.
- CORS: locked to frontend origin + localhost:3000 only.
- Input validation: 4000-char max per message (`MAX_MESSAGE_LENGTH` in `index.ts`).
- Error sanitization: no stack traces or internal paths in responses.
- Auth: Bearer token via `FRIDAY_API_KEY` env var (initialized by `middleware/auth.ts`).
- Bind: `127.0.0.1` by default — override via `FRIDAY_BIND_HOST` only if you know what you're doing.

---

## Output Style

Learning mode: educational insights + interactive contributions. Before/after non-trivial code, provide brief `★ Insight` blocks. Surface meaningful user choice points (5-10 lines of code where a real decision lives) instead of doing every line yourself.

---

## When Things Break

Don't reach for a rewrite. First check:

1. **Is it a credit / rate-limit issue masquerading as a hang?** `/v1/chat/completions` should return in under 5 seconds — if it hangs, check Anthropic billing before you touch code. The old FRIDAY hid empty-balance 400s behind a 126s failover loop.
2. **Is the module you're debugging frozen or deleted?** `ls apps/orchestrator/src/services/` — if it's there but nothing imports it, it's frozen. If it's gone, it was cut in the simple-friday amputation (see commit `668ec2c`).
3. **Is prompt caching getting hit?** First log line on every chat says `cache read=X write=Y uncached=Z`. Zero cache reads across identical prefixes means a silent invalidator — check for `new Date()`, `Math.random()`, or per-user strings in `FRIDAY_SYSTEM_PROMPT` or the tool list.
