# FRIDAY — Activation Runbook

When Anthropic credits land, run these steps. Stop at the first one that fails.

## 1. Verify credits are active

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $(grep ANTHROPIC_API_KEY apps/orchestrator/.env | cut -d= -f2)" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":8,"messages":[{"role":"user","content":"ping"}]}'
```

**Expected:** a JSON body with `content: [{type: "text", text: "..."}]`.
**If credits still empty:** `"error":"Your credit balance is too low..."` — top up, then retry.

---

## 2. Start the orchestrator

```bash
cd apps/orchestrator
npm run dev
```

**Expected:**
```
╔══════════════════════════════════════════════════════════════════╗
║  FRIDAY (simple edition) — http://127.0.0.1:3001                 ║
║  Tools: 50 registered                                            ║
╚══════════════════════════════════════════════════════════════════╝
```

**Verify chat works + caching hits on second call:**
```bash
AUTH="Authorization: Bearer $(grep FRIDAY_API_KEY apps/orchestrator/.env | cut -d= -f2)"

# First call — expect cache write
curl -s -X POST http://127.0.0.1:3001/v1/chat/completions \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"model":"friday","stream":false,"messages":[{"role":"user","content":"say hi in 3 words"}]}'

# Second call — orchestrator log should print [FRIDAY] cache read=XXXX write=0 ...
curl -s -X POST http://127.0.0.1:3001/v1/chat/completions \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"model":"friday","stream":false,"messages":[{"role":"user","content":"say bye in 3 words"}]}'
```

If `cache read=0` on call 2, inspect the system prompt for silent invalidators (see `CLAUDE.md` → "Prompt caching invariant").

---

## 3. Flip Telegram from OpenClaw to the new bot

OpenClaw currently holds the bot token via `channels.telegram.enabled=true`. Free it first.

```bash
# Disable OpenClaw's Telegram channel
# Edit ~/.openclaw/openclaw.json:
#   "channels": { "telegram": { "enabled": false, ... } }
#
# Or one-liner on Windows (PowerShell):
#   (Get-Content $env:USERPROFILE\.openclaw\openclaw.json) `
#     -replace '"enabled": true,\s*"groupPolicy"', '"enabled": false, "groupPolicy"' `
#     | Set-Content $env:USERPROFILE\.openclaw\openclaw.json
# (verify by searching for `"telegram"` and checking `enabled` is false)

# Restart OpenClaw gateway so it drops the Telegram polling
openclaw gateway restart

# Start the FRIDAY Telegram bot
cd apps/telegram-bot
cp .env.example .env   # only on first run — contains real token + allowlist
npm run start
```

**Expected bot log:**
```
[telegram-bot] online — forwarding to http://127.0.0.1:3001, allowlist: [6269427467]
```

**If you see `409: Conflict: terminated by other getUpdates request`:** OpenClaw's Telegram is still running. Step 3a didn't take — re-check `openclaw.json` and restart the gateway.

---

## 4. Verify end-to-end

Text the bot on Telegram (from a Danny account — the allowlist is enforced). Try:

1. `/start` — bot should reply with help text
2. `/status` — bot should report `✅ FRIDAY-orchestrator 2.1.0-simple, 🔧 50 tools, 💬 0 messages`
3. "what time is it" — FRIDAY should answer (may or may not use a tool)
4. Check orchestrator log for `[FRIDAY] cache read=XXXX` — first real message writes the cache, second reads it

---

## 5. Runtime housekeeping

- **Orchestrator log:** stays in the terminal that runs `npm run dev`. Cache stats land on the first line of every chat.
- **Bot log:** stays in the terminal that runs `npm run start`. Rejected users print `[telegram-bot] rejected <id> (not in allowlist)`.
- **Costs:** Sonnet 4.6 is $3/M input, $15/M output. A single 4K-token prompt + 500-token reply = ~$0.02 uncached. With 90% cache read, ≈ $0.003. A day of ~100 messages should be well under a dollar.
- **To stop:** Ctrl-C in both terminals. To restart OpenClaw's Telegram later, flip `enabled` back to `true` and restart the gateway — but stop `apps/telegram-bot` first so they don't collide.

---

## If something goes sideways

| Symptom | Where to look |
|---|---|
| Chat hangs more than 5 seconds | Anthropic credits (lead suspect), then `ollama serve` unrelated — the router is gone, so no fallback confusion |
| Bot replies `⚠️ FRIDAY 401` | `FRIDAY_API_KEY` in `apps/telegram-bot/.env` doesn't match `apps/orchestrator/.env` |
| Bot replies `⚠️ credit balance` | Anthropic billing — not a code issue |
| Bot replies `⚠️ fetch failed` | Orchestrator isn't running, check `apps/orchestrator` terminal |
| `cache read=0` on repeat requests | Silent prefix invalidator — see `CLAUDE.md` → "When things break" |
| Bot doesn't respond to valid user | Check `TELEGRAM_ALLOWLIST` in `apps/telegram-bot/.env` matches the numeric Telegram user ID |

## Rolling back

Simple-friday is a branch. To restore the pre-amputation build:

```bash
cd apps/telegram-bot && npm run stop  # or Ctrl-C the process
cd ../orchestrator && # Ctrl-C the process
cd ../..
git checkout master
# old FRIDAY (with the hang) is back — restart as you did previously
```
