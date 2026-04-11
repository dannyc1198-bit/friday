# FRIDAY — A Personal AI Operating System

> *Iron Man-inspired. Claude-powered. Actually does things.*

FRIDAY is a local-first personal AI assistant built on **Anthropic Claude**. It listens, reasons, and acts across your desktop, browser, smart home, and the web — orchestrating **120+ tools across 23 categories** from a single conversation.

![Status](https://img.shields.io/badge/Build-Phases%200--9%20Complete-brightgreen)
![Tools](https://img.shields.io/badge/Tools-120%2B-blueviolet)
![AI](https://img.shields.io/badge/AI-Anthropic%20Claude%20Sonnet%204-orange)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%C2%B7%20Fastify%20%C2%B7%20Python%20%C2%B7%20Electron-informational)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## What FRIDAY Does

FRIDAY is a complete four-process AI operating system that you talk to. It has persistent memory, a streaming chat interface with an animated boot sequence, a proactive monitoring loop that wakes up on its own, an encrypted credential vault, and an agentic tool-use engine that can chain dozens of operations to complete a request.

**Today, FRIDAY can:**

- 🎙️ **Speak & listen** — ElevenLabs TTS (British "Daniel" voice) + Wispr Flow STT
- 🧠 **Remember** — persistent conversation memory, fact store, and vector recall
- 🖥️ **Control your PC** — launch apps, manage windows, run shell commands
- 💡 **Run your home** — Philips Hue scenes, FRIDAY Mode arc-reactor blue
- 🎵 **Play music** — Spotify playback, search, queue
- 🌐 **Use the browser** — Playwright-driven navigation, form fill, screenshot
- 👁️ **See the screen** — Claude Vision on screenshots for UI understanding
- 📊 **Watch the markets** — CoinGecko polling every 5 min with proactive alerts
- 📰 **Brief you each morning** — calendar, weather, news, portfolio summary
- 🔐 **Protect secrets** — AES-256-GCM credential vault with scrypt key derivation and auto-lock
- 🧪 **Write its own code** — code agent with file ops, lint, and test execution
- ✍️ **Create content** — drafts, scripts, and long-form from templates
- 📈 **Track business intel** — Wavelength pipeline, KPIs, and deal flow
- 🔬 **Learn over time** — lightweight learning engine that tunes behavior from feedback
- ⚡ **Route smart** — Gemini handles simple queries (free), Claude handles complex reasoning (paid), auto-fallback on either side

---

## Why This Project

Most "AI assistants" are chat wrappers. FRIDAY is an attempt at the full thing — a real-time, multi-process agent that can take initiative, hold state, and act on the physical and digital world around a single person. It's built around Anthropic's agentic tool-use loop as the reasoning core, with every surface (voice, desktop, browser, home, web) wired in as a tool the model can call.

The goal is to get as close as possible to *"Tony stands in the lab and FRIDAY handles the rest."*

---

## Architecture

FRIDAY runs as four coordinated processes:

```
┌────────────────────────────────────────────────────────────────┐
│                    Electron Desktop Shell                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Next.js 14 Web UI          (port 3000)                  │  │
│  │  Chat · JarvisOrb · HUD panels · Boot sequence           │  │
│  │  State machine: Dormant → Clap → Boot → Awake            │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │ Server-Sent Events                      │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │  Fastify 5 Orchestrator     (port 3001)                  │  │
│  │  ────────────────────────────────────────────────────    │  │
│  │  • Claude agentic loop (tool-use inside streaming)       │  │
│  │  • Gemini hybrid router (simple → free, complex → paid)  │  │
│  │  • Tool registry — 120+ tools, 23 categories             │  │
│  │  • Proactive monitor (market alerts, briefings)          │  │
│  │  • Learning engine · Memory · Rate limiting              │  │
│  │  • AES-256-GCM credential vault                          │  │
│  └──┬──────────────┬──────────────┬──────────────┬──────────┘  │
│     │              │              │              │             │
│  ┌──▼──────┐  ┌───▼──────┐  ┌───▼──────┐  ┌───▼────────────┐  │
│  │ Anthropic│  │ Playwright│  │  Hue /  │  │ Python Sidecar │  │
│  │  Claude  │  │  Browser  │  │ Spotify │  │   (port 3002)  │  │
│  │   API    │  │           │  │ Google  │  │  Voice · CV    │  │
│  └──────────┘  └───────────┘  └─────────┘  └────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Why four processes?

- **Orchestrator (Node/Fastify)** — the brain. Owns the Claude agentic loop, the tool registry, memory, the vault, and the proactive monitor. Streams responses via SSE.
- **Web UI (Next.js 14)** — the face. The JarvisOrb, the boot animation, the HUD, the chat. Talks to the orchestrator over SSE.
- **Sidecar (Python)** — the hands for anything Python owns better: voice engine, meta-glasses integration, computer vision.
- **Electron shell** — the desktop container that boots everything, handles global hotkeys, and gives FRIDAY a real window on your machine.

---

## Tool Inventory — 120+ tools, 23 categories

FRIDAY's Claude agentic loop runs with a registered tool palette covering:

| Domain | Examples |
|---|---|
| **Browser Automation** | Navigate, click, fill forms, screenshot, wait, evaluate JS |
| **PC Control** | Launch apps, focus windows, keyboard, clipboard, shell |
| **Smart Home** | Hue on/off, color, brightness, scenes, room groups |
| **Music** | Spotify play/pause, search, queue, volume, device select |
| **Voice** | TTS, STT, voice profile selection, interrupt handling |
| **Vision** | Screenshot, region crop, Claude Vision analyze |
| **Memory** | Fact store, vector recall, session summarization |
| **Tasks** | Create, complete, list, remind, recurring |
| **Web** | Tavily search, fetch, scrape, summarize |
| **Gmail / Calendar** | Read, draft, send, schedule, free-time search |
| **Notion** | Pages, databases, comments, blocks |
| **VAPI** | Outbound voice calls with live transcript |
| **Maps** | Place search, directions, ETA, nearby |
| **Markets** | CoinGecko prices, portfolio, alert rules |
| **Code Agent** | File ops, lint, test, diff, patch |
| **Content** | Drafts, scripts, newsletters from templates |
| **Business Intel** | Pipeline, KPIs, deal flow, weekly review |
| **Bluetooth** | Scan, connect, battery status |
| **Health** | Water tracker, focus timer, metrics |
| **Learning** | Feedback capture, behavior tuning |
| **Vault** | Store, retrieve, rotate credentials |
| **System** | Reload, diagnostics, tool hot-swap |
| **Proactive** | Morning briefing, market alerts, queued nudges |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Primary AI** | Anthropic Claude (Sonnet 4) |
| **Secondary AI** | Google Gemini (simple-query router) |
| **Embeddings** | OpenAI `text-embedding-3-small` |
| **Orchestrator** | Node.js · Fastify 5.7 |
| **Frontend** | Next.js 14 · React · TypeScript · Tailwind CSS |
| **Desktop** | Electron |
| **Sidecar** | Python 3.13 · FastAPI |
| **Voice In** | Wispr Flow |
| **Voice Out** | ElevenLabs |
| **Browser Automation** | Playwright |
| **Smart Home** | Philips Hue REST API |
| **Music** | Spotify Web API |
| **Markets** | CoinGecko |
| **Search** | Tavily AI |
| **Vault** | AES-256-GCM + scrypt (N = 65,536) |

---

## Key Engineering Details

**Agentic tool loop is inside the Claude stream.** FRIDAY's tool execution runs inside `streamChatCompletion`, not fire-and-forget after it. This means Claude can call tools mid-stream, consume the results, and keep generating — no round-trip latency per tool call.

**Gemini hybrid router.** Simple queries (classifiers, short lookups, cheap transforms) are routed to Gemini, which is free. Complex reasoning and tool-use stay on Claude. If either provider fails, the router falls back automatically.

**Dormant → Clap → Boot → Awake state machine.** The UI starts asleep. A clap (or hotkey) triggers the Iron Man boot sequence. The JarvisOrb has two variants — a hero orb when the chat is empty, and a compact orb during conversation.

**AES-256-GCM vault with scrypt.** Credentials for Hue, Spotify, Gmail, Notion, ElevenLabs, etc. are encrypted at rest with `scrypt` (N = 65,536) key derivation, unlocked with a PIN, auto-locks after 30 minutes of inactivity, and rate-limits unlock attempts.

**Proactive monitor.** A background loop polls markets, calendars, and weather, and queues alerts via `proactiveMonitor.queueAlert()`. FRIDAY wakes up on its own to tell you things.

**SSE streaming with chunk buffering.** The orchestrator reflects the origin dynamically and buffers SSE chunks to prevent dropped tokens during fast bursts.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+ (for sidecar)
- npm

### Install & Run

```bash
git clone https://github.com/dannyc1198-bit/friday.git
cd friday

# 1. Orchestrator (brain)
cd apps/orchestrator
npm install
cp .env.example .env    # fill in API keys
npm run dev             # → port 3001

# 2. Web UI (in a new terminal)
cd apps/web
npm install
npm run dev             # → port 3000

# 3. Python sidecar (in a new terminal)
cd apps/sidecar
pip install -r requirements.txt
python main.py          # → port 3002

# 4. Electron shell (optional)
cd electron
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) and watch the boot sequence.

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=
OPENAI_API_KEY=         # embeddings only
GEMINI_API_KEY=         # hybrid router

# Voice
ELEVENLABS_API_KEY=

# Integrations
TAVILY_API_KEY=
NOTION_API_KEY=
VAPI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Smart Home
HUE_BRIDGE_IP=
HUE_API_KEY=

# Music
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

---

## Project Structure

```
friday/
├── apps/
│   ├── orchestrator/       Fastify API, Claude loop, tool registry
│   │   └── src/
│   │       ├── config/     System prompt, validation
│   │       ├── services/   LLM, memory, vault, proactive monitor
│   │       └── tools/      120+ tools across 23 categories
│   ├── web/                Next.js 14 chat UI + HUD
│   │   └── src/
│   │       ├── app/        App router, API routes
│   │       └── components/ JarvisOrb, HUD panels, chat
│   └── sidecar/            Python plugins — voice, vision, meta-glasses
├── electron/               Desktop shell
├── scripts/                Utility scripts
├── .planning/              Build state, phase specs
├── JARVIS-BUILD.md         Full 10-phase build specification
└── CLAUDE.md               Project context for Claude Code
```

---

## Build Status

| Phase | Name | Status |
|---|---|---|
| 0 | Wire the Brain | ✅ |
| 1 | Voice I/O | ✅ |
| 2 | Real Tools | ✅ |
| 3 | Integration Bridge | ✅ |
| 4 | Browser Control + Screen Awareness | ✅ |
| 5 | Credential Vault + Permissions | ✅ |
| 6 | Electron Shell + Boot Sequence | ✅ |
| 7 | Proactive Intelligence | ✅ |
| 8 | Advanced Features (code agent, content, BI) | ✅ |
| 9 | Hybrid Router + Learning Engine | ✅ |

**Next:** end-to-end scenario testing, distribution.

---

## License

MIT — Built for one user, open for anyone.
