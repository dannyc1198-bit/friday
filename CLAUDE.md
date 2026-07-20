# FRIDAY — Project Rules

AI personal assistant: voice, tool execution, smart-home control, browser control, proactive intelligence (frozen but on disk).

> **Current branch matters.** If you're on `simple-friday` (default for ongoing work), read this file. `master` is the pre-amputation version — different architecture, much bigger. `git branch --show-current` first.

---

## Current State (2026-06-10, `simple-friday` branch — BRAIN 2.0)

**Brain 2.0 backend live.** See `.planning/STATE.md` for the full current position and resume point.

- **LLM:** provider-agnostic via `services/openai.ts` PROVIDERS presets — **currently Gemini 2.5-flash** (`FRIDAY_LLM_PROVIDER=gemini`, the working free key). Groq preset exists (`FRIDAY_LLM_PROVIDER=groq` + `GROQ_API_KEY`); best free Groq tool-caller is `llama-3.3-70b-versatile` (kimi-k2 / llama-4-maverick deprecated on Groq). 90s client timeout, maxRetries 1.
- **Tools:** 54 registered from 8 modules — pc-control (mouse tools frozen behind `ENABLE_MOUSE_TOOLS`), task-manager, vault-tools, browser-control (consolidated 18→10 on 2026-07-09: nav verbs merged into `browser_navigate` action param, read verbs into `browser_read` what param), **obsidian (9 tools, live vault)**, **brain (4 tools: recall/remember/status/reflect)**, claude-code, app-control. Frozen on disk: hue, bluetooth, health-monitor, health-tracking, music-tools, quiet-mode-tools, identity-tools, calendar, **memory-tools (frozen 2026-07-09 — superseded by brain + task-manager; three overlapping memory stores confused the flash model)**.
- **THE BRAIN:** `services/brain.ts` (MiniSearch BM25 over the vault, heading-chunked, per-message recall injected into the prompt) + `services/reflection.ts` (nightly 21:30 distillation → entity notes in `FRIDAY_BRAIN/entities/`, Daily-note section, `FRIDAY_BRAIN/INDEX.md`) + `routes/brain.ts` (`/api/brain/*`). Markdown is canonical; the index is disposable and rebuilds at boot.
- **Scheduler:** `startScheduler()` IS wired in index.ts now (it never was before — the 5 AM briefing never fired). Jobs: 5:00 briefing, 21:30 reflection. Learning-engine records every chat turn.
- **System prompt** (`config/index.ts`): rewritten 2026-06 to map 1:1 to real tools. HARD RULE: never list a capability there without a registered tool behind it — phantom capabilities were the root cause of hallucinated tool calls.
- **Transport:** Direct Telegraf bot in `apps/telegram-bot` posts to `/v1/chat/completions`.

**Known gaps:** `apps/web` main window still has 7 HUD panels that render MOCK data when their (removed) endpoints 404 — the frontend rebuild (next task) replaces them with a real BrainPanel + health strip. `/api/health` now returns `{llm, tools, tts}` for that strip.

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
- **Never write secrets into the repo.** `.env` only, gitignored. `apps/orchestrator/.env` has `GROQ_API_KEY` and `FRIDAY_API_KEY`; `apps/telegram-bot/.env` has the bot token + allowlist.
- **Rate limiting, CORS, input validation, error sanitization** — all in `apps/orchestrator/src/index.ts`. Preserve on any rewrites.

---

## Architecture Decisions

### Groq via OpenAI SDK (current, 2026-04-27)

- `openai.ts` filename now matches the actual SDK in use — `openai` package pointed at `https://api.groq.com/openai/v1`. Two consumers: `index.ts` and `routes/openai-compat.ts`.
- System prompt is a `role: "system"` message (NOT a separate parameter like Anthropic).
- Tool definitions: `{ type: "function", function: { name, description, parameters: <JSON Schema> } }`.
- Streaming: `delta.content` for text, `delta.tool_calls[]` indexed-by-position for tool calls.
- Tool calls: `assistant` message with `tool_calls[]` array; tool results go as `role: "tool"` messages with `tool_call_id`.
- No mergeConsecutiveMessages needed (OpenAI accepts consecutive same-role messages).
- SSE headers must be set manually via `reply.raw.writeHead()` (Fastify middleware doesn't reach raw writes).
- Tunables block at the top of `openai.ts` (MODEL, MAX_TOKENS, MAX_TOOL_ROUNDS, TEMPERATURE) is the intended adjustment surface — change there, not deep in the loop.

### Prompt caching — REMOVED 2026-04-27

Groq does not support prompt caching. The previous `cache_control` ephemeral blocks are gone. If the codebase ever moves back to Anthropic, restore the two-block system array pattern from git history (commit `668ec2c` had the working version).

### Exports from `openai.ts`

Only two, both used:
- `streamChatCompletion(messages, signal?, extras?)` — agentic streaming with tool loop
- `checkOpenAI()` — health check

`chatCompletion`, `streamRawCompletion`, and `SimpleMessage` were removed — their only callers (ralph-loop, agent-dispatch) are deleted.

### Tool system

54 tools across 8 modules. Register in `apps/orchestrator/src/tools/index.ts`. Frozen modules stay on disk — to re-enable, add back their `registerXTools()` call and import. When adding or merging tools, keep schemas non-overlapping — one obvious tool per intent — and update the CAPABILITIES block in `config/index.ts` in the same commit (hard rule: prompt maps 1:1 to registered tools).

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

- Changed from `claude-sonnet-4-20250514` to `claude-haiku-4-5`. Reason: haiku is free-tier; claude-sonnet-4-6 is the old paid model. Haiku provides sufficient reasoning for most daily tasks.
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
