# FRIDAY on Windows

Danny's machine. Repo folder is wherever you cloned it (the old `C:\Users\12368\jarvis` path is not assumed). Orchestrator is `http://127.0.0.1:3001`. Dashboard is `http://127.0.0.1:3000`.

## 1. Install

Node.js 20 or newer from https://nodejs.org/. Then, in the repo root:

```bat
install.bat
```

That runs `npm install` in `apps\orchestrator`, `apps\web`, and `electron`, and copies `.env.example` files if you don't already have them.

`apps\web` stays on React 18. `@react-three/fiber` is pinned to 8.x so `npm install` resolves. Gods Eye is the only screen that uses it.

## 2. Environment

Secrets live only in gitignored env files.

`apps\orchestrator\.env` (from `.env.example`):

| Variable | Required to boot | What it does |
| --- | --- | --- |
| `GEMINI_API_KEY` or `GROQ_API_KEY` | One LLM key, or chat replies fail | `FRIDAY_LLM_PROVIDER=gemini` or `groq` |
| `FRIDAY_API_KEY` | Generated on first boot if empty | Bearer token. Copy the same value into `apps\web\.env.local` |
| `OBSIDIAN_VAULT_PATH` | No | Vault root. Default `%USERPROFILE%\Obsidian\Wavelength`. Yours: `C:\Users\12368\Obsidian\Wavelength` |
| `ELEVENLABS_API_KEY` | No | JARVIS voice. Empty uses free Edge `en-GB-RyanNeural` |
| `ELEVENLABS_VOICE_ID` or `FRIDAY_VOICE_ID_JARVIS` | No | ElevenLabs voice. Default is Daniel (`onwK4e9ZLuTAKqWW03F9`), a calm British male |
| `TTS_PROVIDER` | No | `auto` (default), `elevenlabs`, or `edge` |
| `EDGE_TTS_VOICE` | No | Default `en-GB-RyanNeural` |
| `GROK_BOTS` | No | `Name\|http://127.0.0.1:port/health\|http://127.0.0.1:port/dispatch` comma-separated. Dots in the agent panel |
| `GROK_BOT_TOKEN` | No | Optional bearer sent to those bot URLs |
| `OPENAI_API_KEY` | No | Codex CLI can use its own `codex` login instead |
| `ANTHROPIC_API_KEY` | No | Claude Code CLI can use its own `claude` login instead |
| `XAI_API_KEY` | No | xAI Grok API. Model override: `XAI_MODEL` (default `grok-4`) |

`apps\web\.env.local`:

- `ORCHESTRATOR_URL=http://127.0.0.1:3001`
- `FRIDAY_API_KEY` — same value as the orchestrator, or the panel can show status but cannot route a task
- `OBSIDIAN_VAULT_PATH` — same vault, used by the brain activity route

Missing agent keys show as **offline**. They do not stop boot.

## 3. Run

```bat
start-unified.bat
```

Orchestrator, then the dashboard. The Python sidecar on port 3002 starts only when `python` is on PATH. Or:

```bat
start-jarvis.bat
```

Same two processes, plus the Electron shell when `electron` is installed. Otherwise it opens the browser.

Say nothing to the mic until the deck is up. Ctrl+Enter toggles live voice.

Checks:

```bat
cd apps\orchestrator
npm run type-check
npm test
npm run dev

cd apps\web
npm run type-check
npm run dev
```

Health: http://127.0.0.1:3001/api/health

The deck's right rail has an **Agents** panel (Grok bots as dots, Codex, Claude Code, xAI Grok). The HUD popout is http://127.0.0.1:3000/hud/agent-roster

## 4. Voice

Default persona is JARVIS: measured British male.

- With `ELEVENLABS_API_KEY`, speech uses ElevenLabs (Daniel, unless you paste another voice id).
- Without it, the server uses Microsoft Edge neural voice `en-GB-RyanNeural` (slower, slightly lower). No film audio.
- If that request fails, the browser speaks with an en-GB male voice (Windows: Ryan or George).

Do not commit commercial music. Startup no longer references the AC/DC file.

## 5. Obsidian

The vault is the memory. `FRIDAY_BRAIN/` core notes are loaded into the prompt. Everything else is searched. `Agents/JARVIS/` is included. Tools: `obsidian_search`, `obsidian_read`, `obsidian_create`, and the rest of the obsidian module. `brain_remember` writes entity notes under `FRIDAY_BRAIN/entities/`.

The vault is not in this repo. Tests use `apps/orchestrator/test-fixtures/vault`.

## 6. Still needs you

- LLM key in `apps\orchestrator\.env` (`GEMINI_API_KEY` or `GROQ_API_KEY`).
- Copy `FRIDAY_API_KEY` into `apps\web\.env.local` after the first orchestrator boot.
- ElevenLabs key only if you want that voice instead of Edge.
- `claude` and `codex` installed and logged in on this PC if those rows should go online.
- `XAI_API_KEY` if you want the Grok API row online.
- `GROK_BOTS` pointed at whatever local bots you actually run.
- Confirm `OBSIDIAN_VAULT_PATH` if the vault is not `C:\Users\12368\Obsidian\Wavelength`.
- Sidecar (`apps\sidecar`) only if you want the camera service. It is not required for the deck.
- Logon task is optional: elevated `install-windows-startup.ps1`.
