# JARVIS — Personal AI Operating System

> *"Just A Rather Very Intelligent System"*

An Iron Man-inspired personal AI assistant built on **Anthropic Claude** — voice-controlled, tool-equipped, and extensible. JARVIS orchestrates 101 tools across 12 categories from a single conversation interface.

![Status](https://img.shields.io/badge/Phase%204-Complete-blue)
![Tools](https://img.shields.io/badge/Tools-101-blueviolet)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20Fastify%20%7C%20Electron-informational)
![AI](https://img.shields.io/badge/AI-Anthropic%20Claude-orange)

---

## What It Does

JARVIS is a fully local, self-hosted AI assistant with a persistent memory, tool execution engine, and a streaming chat interface. You talk to it like Tony Stark talks to Jarvis. It actually does things.

**Currently operational:**
- 🎙️ Voice I/O — ElevenLabs TTS + Wispr Flow STT
- 💡 Smart Home — Philips Hue (lights, scenes, JARVIS Mode: all blue)
- 🎵 Music — Spotify playback control
- 💻 PC Control — App launcher, window manager, system commands
- 🌐 Web — Search (Tavily), fetch, Gmail, Notion, VAPI calls
- 🧠 Memory — Persistent conversation memory + task management
- 🖥️ Browser Control — Playwright-powered browser automation
- 👁️ Screen Awareness — Screenshot capture + Claude Vision analysis
- 📋 Tasks — Built-in task tracker with reminders
- 🔄 Ralph Wiggum Loop — Iterative self-correcting reasoning engine

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Electron Desktop Shell                                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Next.js 14 Frontend (port 3000)                       │  │
│  │  Chat UI · Startup Sequence · Control Center (Ctrl+K)  │  │
│  └────────────────────┬───────────────────────────────────┘  │
│                        │ SSE / HTTP                           │
│  ┌─────────────────────▼──────────────────────────────────┐  │
│  │  Fastify Orchestrator (port 3001)                      │  │
│  │  Tool Router · Agentic Loop · Memory · Rate Limiting   │  │
│  └──┬──────────┬──────────┬──────────┬────────────────────┘  │
│     │          │          │          │                        │
│  Claude    Hue API   Spotify    Playwright                    │
│  (LLM)    (Lights)  (Music)   (Browser)                      │
└──────────────────────────────────────────────────────────────┘
```

**101 tools across 12 categories:**

| Category | Tools | Examples |
|---|---|---|
| Browser Control | 19 | Navigate, click, screenshot, fill forms |
| Integration Bridge | 15 | Gmail, web search, Notion, VAPI |
| PC Control | 13 | Launch apps, manage windows, system commands |
| Task Management | 6 | Create, complete, list, remind |
| Spotify | 10 | Play, pause, search, queue |
| Coding | 6 | Run scripts, file ops, shell commands |
| Bluetooth | 7 | Scan, connect, battery status |
| Hue Lights | 6 | On/off, color, brightness, scenes |
| Maps | 5 | Search places, directions, ETA |
| Memory | 5 | Store facts, recall context |
| Health | 5 | Water tracker, focus timer, metrics |
| System | 5 | Upgrade, diagnostics, reload |

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Brain | Anthropic Claude (`claude-sonnet-4-6`) |
| Embeddings | OpenAI (text-embedding-3-small) |
| Backend | Node.js · Fastify 5.7.4 |
| Frontend | Next.js 14 · TypeScript · Tailwind CSS |
| Desktop | Electron |
| Voice In | Wispr Flow (STT) |
| Voice Out | ElevenLabs (TTS) |
| Browser | Playwright |
| Smart Home | Philips Hue API |
| Music | Spotify Web API |
| Search | Tavily AI |
| Memory | File-based persistent store |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
# Clone the repo
git clone https://github.com/dannyc1198/jarvis.git
cd jarvis

# Orchestrator (AI brain + tools)
cd apps/orchestrator
npm install
cp .env.example .env   # Add your API keys
npm run dev            # Starts on port 3001

# Frontend (in another terminal)
cd apps/web
npm install
npm run dev            # Starts on port 3000
```

Open [http://localhost:3000](http://localhost:3000) and watch the Iron Man startup sequence.

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here      # For embeddings only

# Voice
ELEVENLABS_API_KEY=your_key_here

# Integrations
TAVILY_API_KEY=your_key_here
NOTION_API_KEY=your_key_here
VAPI_API_KEY=your_key_here

# Smart Home
HUE_BRIDGE_IP=your_bridge_ip
HUE_API_KEY=your_key_here

# Music
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

---

## Key Features

### Streaming AI Responses
JARVIS streams responses character-by-character via SSE — no waiting for the full reply.

### Agentic Tool Loop
When given a complex task, JARVIS runs up to 10 rounds of tool calls automatically, chaining results together to complete the job.

### Ralph Wiggum Thinking Loop
An iterative reasoning engine that self-corrects over multiple passes. For hard problems, JARVIS can think for up to 20 iterations with token budget tracking.

### JARVIS Mode
Press `Ctrl+K` to open the Control Center. Hit "Set All Blue" — every Hue light in the room turns arc-reactor blue.

### Persistent Memory
JARVIS remembers things across sessions. Tell it something once; it knows it forever.

---

## Phase Roadmap

| Phase | Name | Status |
|---|---|---|
| 0 | Wire the Brain | ✅ Complete |
| 1 | Voice I/O | ✅ Complete |
| 2 | Real Tools | ✅ Complete |
| 3 | Integration Bridge | ✅ Complete |
| 4 | Browser Control + Screen Awareness | ✅ Complete |
| 5 | Permission System + Credential Vault | Planned |
| 6 | Electron Desktop Shell + Boot Animation | Planned |
| 7 | Proactive Intelligence | Planned |
| 8 | Advanced Features | Planned |
| 9 | Setup Wizard + Distribution | Planned |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Open Control Center |
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Escape` | Close modals |

---

## Project Structure

```
jarvis/
├── apps/
│   ├── orchestrator/       # Fastify API + tool engine
│   │   └── src/
│   │       ├── config/     # System prompt, validation
│   │       ├── services/   # LLM, Ralph loop, embeddings
│   │       └── tools/      # 101 tools across 12 categories
│   └── web/                # Next.js chat interface
│       └── src/
│           ├── app/        # App router, API routes
│           └── components/ # Chat, Sidebar, Control Center
├── .planning/              # Phase state, build spec
└── JARVIS-BUILD.md         # Full 10-phase specification
```

---

## License

MIT — Built by Danny for Danny. Fraser Valley's Tony Stark.
