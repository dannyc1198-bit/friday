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
| `OPENAI_API_KEY` | Brain and Realtime voice | Codex CLI can use its own `codex` login instead. Brain model override: `OPENAI_MODEL` (default `gpt-5.4`). Reflection override: `FRIDAY_REFLECT_MODEL` (default `gpt-5.4-mini`). See `docs/MODELS.md` |
| `ANTHROPIC_API_KEY` | No | Unused. Coding goes to Codex, then the Grok code model. |
| `XAI_API_KEY` | Fallback brain | xAI Grok API. Model override: `XAI_MODEL` (default `grok-4.7`). Needs key until set |
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

The **Agents** tab lists Grok bots as dots plus Codex and the Grok code model. Integrations that still need a key are listed on Today and Agents. The older roster page is still http://127.0.0.1:3000/hud/agent-roster

## 4. Voice

Default persona is JARVIS: measured British male. The boot line uses the same voice.

Typed chat still speaks with ElevenLabs TTS, then Edge `en-GB-RyanNeural`, then the browser. `ELEVENLABS_VOICE_ID` overrides the voice. The default is premade Daniel (`onwK4e9ZLuTAKqWW03F9`).

**Talk → Hands-free** is a live conversation, not a text reply.

- The voice layer is ElevenLabs Agents (ElevenAgents): TTS model `eleven_v3_conversational` with Expressive Mode, Scribe v2 Realtime for speech-to-text (the Agents API name is `scribe_realtime`), and the built-in `turn_v3` turn-taking, which includes barge-in. Checked against the agent update and expressive-mode docs on elevenlabs.io/docs.
- The brain stays Friday. The agent is pointed at Friday's OpenAI-compatible endpoint, which uses OpenAI (`gpt-5.4` unless `OPENAI_MODEL` is set) and fails over to xAI Grok (`grok-4.7` unless `XAI_MODEL` is set) on quota, billing, or outage. A 400 is not failed over. Nightly reflection and the thinking loop use `gpt-5.4-mini` (`FRIDAY_REFLECT_MODEL`) and do not fail over. Gemini and Claude are used only when `FRIDAY_LLM_PROVIDER` names them.
- Friday's tools, the Obsidian brain, and the send/spend/trade block run inside that endpoint. The browser never sees `ELEVENLABS_API_KEY` or `OPENAI_API_KEY`.
- A transcript is shown beside the audio. If ElevenLabs cannot connect, Talk uses OpenAI Realtime (`gpt-realtime-2.1`, voice `cedar`, override with `FRIDAY_REALTIME_MODEL` and `FRIDAY_REALTIME_VOICE`). If that cannot connect, the browser voice speaks the chat reply. Live mode does not stop at text.
- `FRIDAY_VOICE_MODE=realtime` selects the Realtime fallback directly. `FRIDAY_VOICE_MODE=browser` selects the browser voice.

ElevenLabs' servers have to reach Friday. Set `ELEVENLABS_AGENT_ID` (same value as `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` on the web app) and a public `FRIDAY_PUBLIC_URL`, then update the existing agent:

```bat
cd /d C:\Users\12368\Projects\friday
set ELEVENLABS_API_KEY=your-key
set ELEVENLABS_AGENT_ID=your-agent-id
set FRIDAY_PUBLIC_URL=https://your-tunnel.example
set ELEVENLABS_SECRET_ID=the-workspace-secret-id
npx tsx scripts/configure-elevenlabs-agent.ts
```

Create the ElevenLabs workspace secret in the dashboard first. Its value is `FRIDAY_API_KEY`. The script sends the secret id, not the key. The custom LLM URL becomes `https://your-tunnel.example/v1/chat/completions`. Publish the agent in the ElevenLabs dashboard if the PATCH response is a draft. Hold to talk is the other big button. Ctrl+Enter still toggles hands-free.

Do not commit commercial music. Startup no longer plays the old boot voice clip.

## 5. Obsidian

The vault is the memory. `FRIDAY_BRAIN/DANNY-PROFILE.md` is pinned into every prompt (who Danny is, businesses, rules). Other `FRIDAY_BRAIN/` root notes are loaded too. Search prefers current notes over `archive/`. `brain_remember` writes entity notes under `FRIDAY_BRAIN/entities/`. After a conversation, stated goals, preferences, and decisions are written back, dated and deduped. Identity lines such as a business or a name are proposed in `FRIDAY_BRAIN/proposals/DANNY-PROFILE.md` and are not copied into the profile. Anything that would send, spend, or trade is appended to `FRIDAY_BRAIN/drafts/pending-approval.md` and not executed. Nightly reflection at 21:30 writes what was learned and what Friday should improve.

The **Learn** tab shows that feed and the self-repair queue. The **Neural Core** tab is a live graph of real activity: notes `brain_recall` found, tools that ran, facts written, and repair events. It is a reading of that activity. The language model and the vault do the reasoning. A small copy of the graph sits on Today. The thinking loop is off until you press **Arm thinking**. It reviews recent chats at most 4 times a day, 30 minutes apart, writes dated notes to `FRIDAY_BRAIN/insights/`, and proposes profile lines in `FRIDAY_BRAIN/proposals/DANNY-PROFILE.md`. It does not edit `DANNY-PROFILE.md`, and it does not send, spend, or trade. `FRIDAY_THINKING=1` arms the loop at boot. Runtime errors, failed tools, and reported misfires are journaled in `FRIDAY_BRAIN/health/`. The third identical failure asks Codex for a fix on a new `friday/fix-` branch. Tests have to pass. Approve or Reject is on that tab. Friday does not merge into `main` or `master`, does not push before approval, and does not commit `.env` or other secrets. A failed health check after a merge resets that branch tip back to the recorded commit. At most three repair attempts per day. Set `FRIDAY_HEALTHCHECK=1` before the nightly check will run `npx tsc --noEmit`. `FRIDAY_HEALTHCHECK_TESTS=1` adds `npm test`.

Chat memory does not need Chroma. Leave `CHROMA_ENABLED` empty. A file under `apps\orchestrator\data\memory` holds chat snippets. The boot log says which backend is in use.

The vault is not in this repo. Tests use `apps/orchestrator/test-fixtures/vault`.

## 6. Creative

Content tab buttons call Meshy, Higgsfield, and Blender through the intent router. Jobs show progress in the gallery. Files land in `FRIDAY_MEDIA_DIR` or `apps\orchestrator\data\media`.

- Meshy: `MESHY_API_KEY`. Text-to-3D preview then refine. Image-to-3D from an http(s) URL.
- Higgsfield: `HF_API_KEY_ID` plus `HF_API_KEY_SECRET` (Authorization `Key id:secret`). Image default is Soul standard. Video default is Kling 3.0 standard text-to-video.
- Blender: headless `blender -b --python` for a preview PNG, or open the GUI. Offline until `blender.exe` exists.

## 7. Still needs you

- `OPENAI_API_KEY` in `apps\orchestrator\.env` for the brain. `XAI_API_KEY` is the quota and outage fallback and shows "needs key" until set.
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
