# Friday

A local personal assistant with a console you can put on a screen. Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Once each browser session it plays a short arc-reactor boot and, unless Demo is on, says "Hello, sir."

Model ids, fallback, and prices: [docs/MODELS.md](docs/MODELS.md). What is still rough: [docs/AUDIT.md](docs/AUDIT.md).

The window is Next.js 14. The brain is Fastify on port 3001. A Python sidecar on port 3002 is optional.

---

## The console

`/` is the enterprise console. The sidebar is the map:

| Group | Pages |
|---|---|
| Primary | Overview (the Today board), Agents, Brain, Mindspace, Talk, Tasks |
| Live apps | God's Eye, Body Anatomy, Sports |
| Businesses | Wavelength, Property, Ally |
| Also | Content, Learning, Repairs, Settings |

The top strip is Overview, Agents, Brain, God's Eye, Body Anatomy, and Sports. Keys `1`–`6`, Alt+Left/Right, and Ctrl+Tab move along it. Ctrl+K or Cmd+K opens page search from any console page. The header search button does the same.

**Brain** (`/brain-core`) draws the Obsidian vault: every note is a node, links are edges, and a note glows when Friday recalls, reads, or writes it. Click a node to read it and open it in Obsidian. Demo mode draws two SAMPLE notes instead of the vault.

**Mindspace** is six specialists. Friday routes the request. Ultron can only criticise. Nobody sends, spends, or trades.

**Overview** shows the next task, open work, live-app tiles (God's Eye, Osiris, Body Anatomy, Sports), and recent activity.

**Demo** is off until you turn it on (header button, or Settings). The flag is `localStorage` key `friday-demo`, so it is per browser profile. On, pages show labelled SAMPLE data, the banner says nothing is sent, and Talk does not call the model or live voice. Turn it on before a screen share.

**Setup** is `GET /api/setup`: booleans and env names only, never a key. Settings lists the checks. The older flight deck at `/deck` still has the Today checklist (green and red dots, the env name in gold on a red row), a Commands button, and a command palette (Ctrl+K or Cmd+K, Esc, arrows, Enter, including Show setup). That deck is also where you arm the thinking loop. The console Brain tab does not.

The thinking loop stays off until that deck toggle, or `FRIDAY_THINKING=1`. It reviews recent chats and vault notes at most 4 times a day, 30 minutes apart, and writes dated notes under `FRIDAY_BRAIN/insights/`. It does not send, spend, or trade.

---

## Brain

By default, chat and tool calls use OpenAI `gpt-5.4` (`OPENAI_MODEL` or `FRIDAY_LLM_MODEL`). The next try is xAI `grok-4.7` (`XAI_MODEL`), then Gemini `gemini-2.5-flash` (`GEMINI_MODEL`) when `GEMINI_API_KEY` is set. A provider with no key is skipped.

You can pin the first try without editing `.env`:

- Settings, or the flight deck, writes `data/settings.json`.
- Saying it in Talk uses the `set_brain_provider` tool. The choices are `openai`, `xai`, and `gemini`.

A saved choice is tried first and overrides `FRIDAY_LLM_PROVIDER`. OpenAI credit exhaustion (`insufficient_quota`, `credit_balance_exhausted`, `billing_hard_limit`) is remembered for about five minutes, and the next turn skips that provider. A Gemini per-minute 429 waits for Retry-After (capped at eight seconds), retries `gemini-2.5-flash` once, then tries `gemini-2.5-flash-lite` on the same key. A 400 or 422 stays on the provider that rejected it.

When a Gemini key is set, Mindspace's classifier and a team fan-out start on `gemini-2.5-flash-lite` so they do not spend the chat minute. Specialist answers on the chain tier use `gemini-2.5-flash`, then flash-lite after a 429. The specialist caller comments this as the Gemini free tier. Ordinary chat does not split "simple" questions onto Gemini. Tool calls stay on the active chat model.

Reflection and the thinking loop call `gpt-5.4-mini` (`FRIDAY_REFLECT_MODEL`) with failover off. A bad mini id fails that pass. It does not bill `grok-4.7`.

Chat memory embeddings use `text-embedding-3-small` (`EMBEDDING_MODEL`). Vault recall is local BM25, not an embedding call.

If nothing is saved and `FRIDAY_LLM_PROVIDER` is `groq` or `anthropic`, that one provider is used by itself. Claude is not the default brain, and Claude Code is not registered.

---

## Voice

Hands-free lives on Talk. Ctrl+Enter starts it when Demo is off.

1. ElevenLabs Agents, when `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` are set. The agent's custom LLM is Friday's own chat route, so the spoken brain is the chain above. `ELEVENLABS_AGENT_LLM` can name an ElevenLabs model instead (no public URL).
2. OpenAI Realtime (`gpt-realtime-2.1`, voice `cedar`) when there is an OpenAI key and no agent id.
3. Speak-every-reply: ElevenLabs TTS if the key is set, then the free Edge neural voice. With no key, Edge speaks. The default Edge voice is `en-GB-RyanNeural` unless `EDGE_TTS_VOICE` is set.

`FRIDAY_VOICE_MODE` can force `elevenlabs`, `realtime`, or `browser`. Listening in the browser uses the Web Speech API. If server audio cannot play, the browser's speech synthesis is the last speaker. An empty ElevenLabs key does not crash TTS. It falls through to Edge.

---

## Coding

Coding, debugging, and "add a capability" go to `route_agent_task` with agent `codex` (`codex exec`, stdin closed). If Codex is offline, the same tool uses `xai-grok`, the xAI code model `grok-code-fast-1` (`XAI_CODE_MODEL`). Asking for `claude-code` returns an error that names those two. Dispatch does not merge or push.

Grok bots (`GROK_BOTS`) are separate status dots. They are not the coding fallback.

---

## Tools

`initializeTools()` registers **67 tools** at boot. `GET /api/health` reports that count, plus any MCP tools loaded from `~/.friday/mcp.json` (names prefixed `mcp_<server>_`).

What is actually registered:

- PC: open and close apps, system info, volume, screenshot, the active window, lock screen, keyboard
- Browser (Playwright): navigate, click, type, keys, scroll, select, read, screenshot, close, login
- Obsidian: search, read, list, recent, create, edit, daily note, tags, delete
- Brain: recall, remember, status, reflect
- Tasks, the credential vault, and skill proposals (a proposal does not apply itself)
- Creative drafts: Meshy, Higgsfield, Blender. A missing key shows as needs-key. Nothing is published
- Agents, the brain switch, Mindspace, live-app status, fleet controls, a market snapshot, intel

Mouse tools stay in the file and are not registered. Hue, Bluetooth, music, and the health trackers are on disk and are not in the live registry. Email, phone calls, and smart home are not wired. Friday is supposed to say so.

---

## Getting started

Node.js and npm. Python only if you want the sidecar.

Windows, from the repo root:

```bat
install.bat
start-unified.bat
```

`install.bat` installs the orchestrator, the web app, and Electron. `start-unified.bat` starts the orchestrator (3001), the optional sidecar (3002), and the console (3000). It does not open Electron.

By hand:

```bash
cd apps/orchestrator
npm install
cp .env.example .env
npm run dev

cd apps/web
npm install
npm run dev
```

Copy `apps/web/.env.example` to `apps/web/.env` if the web app should send `FRIDAY_API_KEY`. Put secrets only in those `.env` files. They are gitignored.

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

---

## Environment

Names only. `GET /api/setup` checks these:

| Check | Env | Required |
|---|---|---|
| OpenAI key | `OPENAI_API_KEY` | Yes. Chat stays offline without it. |
| xAI fallback | `XAI_API_KEY` | Optional. |
| Obsidian vault | `OBSIDIAN_VAULT_PATH` | The vault folder. No default folder is assumed found. |
| Voice | `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`, or `OPENAI_API_KEY` | The browser voice still speaks if both are missing. |

`apps/orchestrator/.env.example` also names:

`PORT` `HOST` `CORS_ORIGIN` `USER_NAME` `ENABLE_TOOLS` `ENABLE_STREAMING` `MEDIA_PROVIDER` `SMART_HOME_PROVIDER` `USE_REAL_BLUETOOTH` `TTS_PROVIDER` `ELEVENLABS_VOICE_ID` `FRIDAY_VOICE_ID_JARVIS` `FRIDAY_VOICE_ID_FRIDAY` `EDGE_TTS_VOICE` `EDGE_TTS_VOICE_JARVIS` `EDGE_TTS_VOICE_FRIDAY` `GROK_BOTS` `GROK_BOT_TOKEN` `FRIDAY_LLM_PROVIDER` `FRIDAY_LLM_FAILOVER` `OPENAI_MODEL` `FRIDAY_REFLECT_MODEL` `EMBEDDING_MODEL` `ANTHROPIC_API_KEY` `XAI_MODEL` `XAI_BASE_URL` `FRIDAY_VOICE_MODE` `ELEVENLABS_SECRET_ID` `FRIDAY_PUBLIC_URL` `FRIDAY_REALTIME_MODEL` `FRIDAY_REALTIME_VOICE` `FRIDAY_HEALTHCHECK` `FRIDAY_HEALTHCHECK_TESTS` `FRIDAY_THINKING` `CHROMA_ENABLED` `CHROMA_HOST` `CHROMA_PORT` `CHROMA_RETENTION_DAYS` `CHROMA_CONTEXT_LIMIT` `CHROMA_MIN_SIMILARITY` `MESHY_API_KEY` `HF_API_KEY_ID` `HF_API_KEY_SECRET` `HIGGSFIELD_API_KEY` `HIGGSFIELD_IMAGE_MODEL` `HIGGSFIELD_VIDEO_MODEL` `BLENDER_PATH` `FRIDAY_MEDIA_DIR` `TAVILY_API_KEY` `NOTION_API_KEY` `VAPI_API_KEY` `VAPI_ASSISTANT_ID` `VAPI_WEBHOOK_SECRET` `OPENCLAW_BASE_URL` `NETLIFY_AUTH_TOKEN` `RECEPTIONIST_VAPI_ASSISTANT_ID` `RECEPTIONIST_WEBHOOK_SECRET` `RECEPTIONIST_CALENDAR_ID` `DANNY_EMAIL` `NGROK_URL` `GOOGLE_SERVICE_ACCOUNT_JSON` `GMAIL_USER` `GMAIL_APP_PASSWORD` `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` `JARVIS_API_KEY` `FRIDAY_API_KEY` `GEMINI_API_KEY` `AGENT_OS_URL` `AGENT_OS_TOKEN` `BATTLE_STATION_URL` `OSIRIS_URL` `OPENCLAW_SYNC`

`ANTHROPIC_API_KEY` is in that example for a Claude Code CLI. The CLI is not a registered tool.

`apps/web/.env.example` names `NEXT_PUBLIC_API_URL` `ORCHESTRATOR_URL` `FRIDAY_API_KEY` `OBSIDIAN_VAULT_PATH` `HEALTH_CHECK_INTERVAL` `NEXT_PUBLIC_VOICE_ENABLED`.

Code-only overrides, not listed in the example: `FRIDAY_LLM_MODEL`, `FRIDAY_LLM_BASE_URL`, `FRIDAY_LLM_API_KEY`, `GEMINI_MODEL`, `GEMINI_LITE_MODEL`, `GEMINI_BASE_URL`, `XAI_CODE_MODEL`.

---

## Project structure

```
friday/
├── apps/
│   ├── orchestrator/     Fastify brain, port 3001
│   │   └── src/
│   │       ├── config/   System prompt, env
│   │       ├── services/ Model roles, provider chain, voice, agents
│   │       └── tools/    The 67 registered tools
│   ├── web/              Next.js console, port 3000
│   │   └── src/
│   │       ├── app/(console)/   Overview, Brain, Mindspace, Talk, …
│   │       └── components/      console/ and the flight deck in deck/
│   └── sidecar/          Optional Python process, port 3002
├── electron/             Installed by install.bat. Not started by start-unified.bat
├── docs/
│   ├── MODELS.md         Brain order, ids, prices
│   └── AUDIT.md          What is fixed, and what is still open
├── scripts/
├── install.bat
└── start-unified.bat
```

---

## Checks

```bash
cd apps/orchestrator
npm test
npx tsc --noEmit
cd ../web
npx tsc --noEmit
```
