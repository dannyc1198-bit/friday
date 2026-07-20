# Friday — Python brain layer

Voice-first AI co-founder. Sits as a peer to `apps/orchestrator`, `apps/sidecar`, `apps/web`, and `apps/telegram-bot` in the jarvis monorepo.

> Path A architecture (per `simple-friday` decision, 2026-05-02): Python owns brain + voice + monitors. TypeScript orchestrator stays the tool execution layer. Don't tear out working transports — Telegram bot and phone line keep working.

## Ports

| App | Port | Stack |
|---|---|---|
| `apps/web` | 3000 | Next.js HUD |
| `apps/orchestrator` | 3001 | Fastify (TS) — tool execution + LLM-compat shim |
| `apps/sidecar` | 3002 | FastAPI (Py) — eyes + face + camera |
| `apps/friday` | 3003 | FastAPI (Py) — brain + voice + monitors **(this app)** |

## Quickstart

```bash
cd apps/friday
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
playwright install chromium                       # for Scout + Intel
cp .env.example .env                              # then fill in keys

# DB (Postgres 14+)
createdb friday
psql friday -f db/schema.sql

# Boot
python main.py
```

Boot succeeds with just these env vars:
- `GROQ_API_KEY` (LLM brain — Groq free tier)
- `DEEPGRAM_API_KEY` + `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (voice)
- `DATABASE_URL`

Everything else is optional — monitors degrade gracefully when their integration is unconfigured.

## Architecture

```
                       ┌─────────────────────┐
                       │   apps/friday       │  port 3003
                       │   ─────────────     │
   "Hey Friday" ──────►│  voice_in (Deepgram)│
                       │         │           │
                       │         ▼           │
                       │   brain (Groq)      │
                       │     │       │       │
                       │     ▼       ▼       │
                       │ monitors  agents    │
                       │  (poll)  (Ripple/   │
                       │     │     Forge/    │
                       │     │     Scout)    │
                       │     │       │       │
                       │     ▼       ▼       │
                       │   Postgres          │
                       │     │               │
                       │     ▼               │
                       │ voice_out (11Labs)  │──────► speaker
                       └──────────┬──────────┘
                                  │
                  ┌───────────────┼─────────────────┐
                  │               │                 │
                  ▼               ▼                 ▼
        apps/orchestrator   apps/sidecar      Stripe / Supabase
        :3001 (50 tools)    :3002 (eyes)      Gmail / Calendar
        TS                  Python            (per-monitor)
```

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-05-02 | Path A: port not greenfield | Existing `simple-friday` already amputated; rewriting throws away 3.6K LOC of working code |
| 2026-05-02 | Groq stays as LLM | Free tier, decided 2026-04-27. Rebuild prompt assumed Anthropic but Path A respects existing provider choice |
| 2026-05-02 | Phone + Telegram stay | Working transports; Trillion-style WebSocket UI is additive, not a replacement |
| 2026-05-02 | New `apps/friday/` peer to orchestrator | Brain in Python, tools stay in TS — bridge via two new endpoints (`/v1/tools/list`, `/v1/tools/execute`) |

## What still needs your input

1. **`config/friday_soul.md`** — four TODO blocks at the bottom. Friday's voice is yours, not mine.
2. **Frontend scope** — open question: is the Trillion-identical UI a new app (`apps/friday-web`) or a replacement for `apps/web`?

## Layout

```
apps/friday/
├── main.py                   # Entry point — wake word loop + monitors + API
├── core/
│   ├── brain.py              # Groq via openai SDK + tool loop + soul prompt
│   ├── voice_in.py           # Deepgram streaming STT + wake word
│   ├── voice_out.py          # ElevenLabs streaming TTS
│   ├── memory.py             # asyncpg conversation persistence
│   ├── context_builder.py    # Assembles monitor snapshots into brain prompt
│   └── orchestrator_client.py # Bridge to apps/orchestrator (tool exec)
├── monitors/
│   ├── revenue.py            # Stripe MRR, churn, failed payments
│   ├── pipeline.py           # Supabase leads, follow-up cadence
│   ├── polyclaw.py           # PolyClaw trading agent state
│   ├── comms.py              # Gmail unread + Calendar next 24h
│   ├── intel.py              # Competitor browser monitoring
│   └── health.py             # System uptime + orchestrator + sidecar status
├── agents/
│   ├── ripple.py             # Outreach + client comms
│   ├── forge.py              # Build + n8n workflows
│   └── scout.py              # Research + competitive intel
├── api/
│   └── server.py             # FastAPI WebSocket endpoint (Trillion-style UI feed)
├── config/
│   ├── settings.py           # env loading + validation
│   └── friday_soul.md        # Personality prompt — you fill the TODOs
└── db/
    └── schema.sql            # Postgres schema (5 tables)
```
