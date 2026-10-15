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
| `ELEVENLABS_API_KEY` | No | Boot greeting and JARVIS voice. Empty uses free Edge `en-GB-RyanNeural` |
| `ELEVENLABS_VOICE_ID` or `FRIDAY_VOICE_ID_JARVIS` | No | ElevenLabs voice. Default is premade Daniel (`onwK4e9ZLuTAKqWW03F9`), a calm British male |
| `TTS_PROVIDER` | No | `auto` (default), `elevenlabs`, or `edge` |
| `EDGE_TTS_VOICE` | No | Default `en-GB-RyanNeural` |
| `GROK_BOTS` | No | See the exact format below. Dots on the Agents tab |
| `GROK_BOT_TOKEN` | No | Optional bearer sent to those bot URLs |
| `OPENAI_API_KEY` | No | Codex CLI can use its own `codex` login instead |
| `ANTHROPIC_API_KEY` | No | Claude Code CLI can use its own `claude` login instead |
| `XAI_API_KEY` | No | xAI Grok API. Model override: `XAI_MODEL` (default `grok-4`) |
| `MESHY_API_KEY` | No | Text-to-3D and image-to-3D. HUD shows needs key until set |
| `HF_API_KEY_ID` and `HF_API_KEY_SECRET` | No | Higgsfield. Or one line `HIGGSFIELD_API_KEY=id:secret` |
| `BLENDER_PATH` | No | Default `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe` |
| `CHROMA_ENABLED` | No | Leave empty. Chat memory is a local file. The vault is the brain |

`GROK_BOTS` is comma-separated. Each bot is `Name|statusUrl|dispatchUrl`. Status is a GET. Dispatch is a POST of `{"agent","task"}`.

```
GROK_BOTS=Nexus|http://127.0.0.1:7777/health|http://127.0.0.1:7777/dispatch,Builder|http://127.0.0.1:7778/health|http://127.0.0.1:7778/dispatch
```

`apps\web\.env.local`:

- `ORCHESTRATOR_URL=http://127.0.0.1:3001`
- `FRIDAY_API_KEY` — same value as the orchestrator, or the panel can show status but cannot route a task
- `OBSIDIAN_VAULT_PATH` — same vault, used by the brain activity route

Missing keys show as **needs key**. They do not stop boot.

The HUD opens on **Today** (one task). Big tabs: Wavelength, Content, Ally, Talk, Agents. Workspace buttons send one request into Talk. Drafts only — nothing is sent, spent, or traded from those buttons.

On each boot the HUD speaks once: "Hey Daniel, how's it going boss? What do we need to do today?" If the browser blocks audio, click **Wake Friday**. A refresh of the same boot does not say it again.

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

The **Agents** tab lists Grok bots as dots plus Codex, Claude Code, and xAI. Integrations that still need a key are listed on Today and Agents. The older roster page is still http://127.0.0.1:3000/hud/agent-roster

## 4. Voice

Default persona is JARVIS: measured British male. The boot line uses the same voice.

- With `ELEVENLABS_API_KEY`, speech uses ElevenLabs. `ELEVENLABS_VOICE_ID` overrides the voice. The default is premade Daniel (`onwK4e9ZLuTAKqWW03F9`).
- Without a key, or if ElevenLabs fails, the server uses Microsoft Edge `en-GB-RyanNeural`.
- If that request fails, the browser speaks with an en-GB male voice (Windows: Ryan or George).
- After the greeting, the mic listens when it is available. Otherwise the chat box is focused.

Do not commit commercial music. Startup no longer plays the old boot voice clip.

## 5. Obsidian

The vault is the memory. `FRIDAY_BRAIN/DANNY-PROFILE.md` is pinned into every prompt (who Danny is, businesses, rules). Other `FRIDAY_BRAIN/` root notes are loaded too. Search prefers current notes over `archive/`. `brain_remember` writes entity notes under `FRIDAY_BRAIN/entities/`. After a conversation, stated goals and decisions are written back, dated and deduped. Anything that would send, spend, or trade is appended to `FRIDAY_BRAIN/drafts/pending-approval.md` and not executed. Nightly reflection still runs at 21:30.

Chat memory does not need Chroma. Leave `CHROMA_ENABLED` empty. A file under `apps\orchestrator\data\memory` holds chat snippets. The boot log says which backend is in use.

The vault is not in this repo. Tests use `apps/orchestrator/test-fixtures/vault`.

## 6. Creative

Content tab buttons call Meshy, Higgsfield, and Blender through the intent router. Jobs show progress in the gallery. Files land in `FRIDAY_MEDIA_DIR` or `apps\orchestrator\data\media`.

- Meshy: `MESHY_API_KEY`. Text-to-3D preview then refine. Image-to-3D from an http(s) URL.
- Higgsfield: `HF_API_KEY_ID` plus `HF_API_KEY_SECRET` (Authorization `Key id:secret`). Image default is Soul standard. Video default is Kling 3.0 standard text-to-video.
- Blender: headless `blender -b --python` for a preview PNG, or open the GUI. Offline until `blender.exe` exists.

## 7. Still needs you

- LLM key in `apps\orchestrator\.env` (`GEMINI_API_KEY` or `GROQ_API_KEY`).
- Copy `FRIDAY_API_KEY` into `apps\web\.env.local` after the first orchestrator boot.
- ElevenLabs key only if you want that voice instead of Edge.
- `claude` and `codex` installed and logged in on this PC if those rows should go online.
- `XAI_API_KEY`, `MESHY_API_KEY`, and Higgsfield `HF_API_KEY_ID` / `HF_API_KEY_SECRET` when you want those rows to leave "needs key".
- `GROK_BOTS` in the `Name|statusUrl|dispatchUrl` format above, pointed at bots you actually run.
- Confirm `OBSIDIAN_VAULT_PATH` and that `FRIDAY_BRAIN/DANNY-PROFILE.md` is the profile you want pinned.
- Blender 5.0 at the default path, or set `BLENDER_PATH`.
- Sidecar (`apps\sidecar`) only if you want the camera service. It is not required for the deck.
- Logon task is optional: elevated `install-windows-startup.ps1`.
- `next@14.2.3` has a published security advisory. Left in place on purpose.
