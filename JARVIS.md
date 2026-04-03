# JARVIS - Personal AI Assistant

> "Just A Rather Very Intelligent System" — Built for Danny

## Vision

A fully operational Iron Man-style AI assistant that runs as a transparent desktop overlay on Danny's Windows PC. Voice-controlled, visually stunning, and actually useful — controlling smart home devices, playing music, automating the PC, and greeting Danny every morning like Tony Stark's lab.

---

## Current State (Feb 2026)

### What Works
- Iron Man startup sequence (Arc Reactor animation, hex streams, scanlines, AC/DC soundtrack)
- Personalized greeting: "Good morning, Mr. Danny" with typewriter effect
- HUD briefing panels (crypto, stocks, weather, email, tasks)
- Streaming chat UI with JARVIS personality
- Control Center (Ctrl+K) with 3 tabs: PC Tools, Bluetooth, Smart Lights
- Smart light color picker + "Set All Blue" JARVIS Mode
- 9 voice pack options (JARVIS, Friday, Cortana, JARVIS, Vision, etc.)
- Orchestrator API built with GPT-4 tool calling + 12 tool categories
- Long-term memory system (ChromaDB)

### What's Mock / Not Connected
- Frontend talks to its own stub API, NOT the real orchestrator
- All tools return mock data (PC control, Spotify, Alexa, Bluetooth)
- Voice I/O not started (mic button disabled)
- No Electron wrapper (runs in browser tab, not as desktop overlay)
- No wake word detection
- No Windows auto-start

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  LAYER 1: FRONTEND UI            [COMPLETE]     │
│  Next.js 14 + React 18 + Tailwind              │
│  Iron Man theme, streaming chat, Control Center │
└─────────────────┬───────────────────────────────┘
                  │ HTTP/SSE (NOT YET CONNECTED)
┌─────────────────▼───────────────────────────────┐
│  LAYER 2: ORCHESTRATOR API       [BUILT]        │
│  Fastify + OpenAI GPT-4 Turbo                   │
│  Tool registry, intent classification, memory   │
└─────────────────┬───────────────────────────────┘
                  │ Internal tool calls
┌─────────────────▼───────────────────────────────┐
│  LAYER 3: BACKEND TOOLS          [BUILT/MOCK]   │
│  PC Control, Smart Home, Media, Bluetooth,      │
│  Health, Code Gen, Maps, Self-Upgrade,          │
│  Memory, Tasks (12 categories, ~5700 lines)     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  LAYER 4: VOICE + OVERLAY        [NOT STARTED]  │
│  Whisper STT, OpenAI TTS (British accent),      │
│  Wake word, Electron transparent overlay        │
└─────────────────────────────────────────────────┘
```

---

## Project Structure

```
JARVIS/
├── apps/
│   ├── web/                         # Frontend (Next.js 14)
│   │   ├── src/
│   │   │   ├── app/                 # App router + API stubs
│   │   │   ├── components/          # 14 React components
│   │   │   │   ├── IronManStartup   # 23KB animated startup sequence
│   │   │   │   ├── ChatPanel        # Message display + streaming
│   │   │   │   ├── ToolControlPanel # 16KB control center modal
│   │   │   │   ├── InputBar         # Chat input + mic button
│   │   │   │   ├── Sidebar          # Conversation history
│   │   │   │   └── VoiceConfig      # Voice pack selector
│   │   │   ├── hooks/               # useChat, useHealth, etc.
│   │   │   ├── services/            # API communication
│   │   │   └── types/               # TypeScript interfaces
│   │   └── public/sounds/           # 9 voice packs audio assets
│   │
│   └── orchestrator/                # Backend API (Fastify)
│       ├── src/
│       │   ├── index.ts             # Server setup + endpoints
│       │   ├── services/
│       │   │   ├── openai.ts        # GPT-4 streaming + tool calls
│       │   │   ├── conversation.ts  # Context management
│       │   │   ├── intent.ts        # Message classification
│       │   │   └── memory/          # ChromaDB long-term memory
│       │   └── tools/               # 12 tool modules
│       │       ├── pc-control.ts    # PowerShell Windows automation
│       │       ├── smart-home.ts    # Alexa API integration
│       │       ├── media.ts         # Spotify playback control
│       │       ├── bluetooth.ts     # Device management
│       │       ├── health-monitor   # Vitals + fitness tracking
│       │       ├── code-generator   # AI code generation
│       │       ├── maps-location    # Directions + POI search
│       │       ├── self-upgrade     # Auto-update system
│       │       ├── memory-tools     # Save/recall/search memories
│       │       └── task-manager     # Todo list management
│       └── .env                     # API keys (NEVER COMMIT)
│
├── JARVIS.md                        # THIS FILE - project reference
├── CLAUDE.md                        # AI build guidelines
├── README.md                        # Setup & usage docs
├── JARVIS-cli.js                    # CLI launcher
├── start-JARVIS.bat                 # Windows batch launcher
└── install-startup.ps1              # Windows auto-start installer
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14, React 18, TypeScript | UI framework |
| Styling | Tailwind CSS | Arc Reactor dark theme |
| Fonts | Inter, JetBrains Mono | UI + monospace |
| Backend | Fastify (Node.js) | High-perf API server |
| AI Brain | OpenAI GPT-4 Turbo | Chat + tool calling |
| Speech-to-Text | OpenAI Whisper | Voice input (planned) |
| Text-to-Speech | OpenAI TTS / ElevenLabs | British accent output (planned) |
| Memory | ChromaDB + OpenAI Embeddings | Long-term recall |
| Smart Home | Amazon Alexa API | Light/device control |
| Music | Spotify Web API | Playback control |
| PC Control | PowerShell (child_process) | Windows automation |
| Desktop Overlay | Electron (planned) | Transparent HUD window |

---

## Completion Plan — What "Done" Looks Like

### Phase 1: Wire the Brain (Priority: HIGH)
Connect frontend to orchestrator so JARVIS actually thinks.
- [ ] Point web app API calls to orchestrator (localhost:3001)
- [ ] Set real OpenAI API key in orchestrator .env
- [ ] Test streaming chat with real GPT-4 responses
- [ ] Verify tool calling works end-to-end
- **Result:** JARVIS responds intelligently with real AI

### Phase 2: Real Tool Execution (Priority: HIGH)
Switch tools from mock to live.
- [ ] PC Control: Test PowerShell app launching, volume, system info
- [ ] Smart Lights: Configure Alexa API credentials → real light control
- [ ] Media: Configure Spotify OAuth → real music playback
- [ ] Bluetooth: Test real Windows BT scanning/pairing
- **Result:** "JARVIS, dim the lights and play AC/DC" actually works

### Phase 3: Voice I/O (Priority: HIGH)
Make JARVIS voice-first.
- [ ] Integrate OpenAI Whisper for speech-to-text (mic button)
- [ ] Integrate OpenAI TTS or ElevenLabs for British accent output
- [ ] Add wake word detection ("Hey JARVIS")
- [ ] Audio feedback sounds (activation chime, processing indicator)
- **Result:** Talk to JARVIS hands-free, hear British responses

### Phase 4: Desktop Overlay / Electron (Priority: MEDIUM)
Make it feel like an OS, not a browser tab.
- [ ] Wrap in Electron with transparent/frameless window
- [ ] Always-on-top HUD mode (system stats, notifications)
- [ ] System tray icon with quick actions
- [ ] Global hotkey to summon/dismiss JARVIS
- [ ] Multi-monitor support
- **Result:** JARVIS floats over your desktop like the movie

### Phase 5: 3D Visuals + Polish (Priority: MEDIUM)
Level up the visual experience.
- [ ] Three.js Arc Reactor 3D animation (replaces SVG)
- [ ] Holographic UI effects (glass morphism, particle systems)
- [ ] Animated data visualizations on startup
- [ ] Transition effects between states
- [ ] Dark/light theme toggle (JARVIS blue vs Friday orange)
- **Result:** Looks like Stark Industries tech

### Phase 6: Proactive + Automation (Priority: MEDIUM)
JARVIS anticipates your needs.
- [ ] Windows auto-start on login (Task Scheduler)
- [ ] Morning routine: greet → briefing → set lights → play music
- [ ] Calendar integration (Google/Outlook) for meeting reminders
- [ ] Proactive suggestions ("You have a meeting in 15 minutes")
- [ ] Weather-based mood lighting
- **Result:** JARVIS runs your life like a real assistant

### Phase 7: Mobile Companion (Priority: LOW)
Control JARVIS from your phone.
- [ ] React Native app or PWA
- [ ] Push notifications
- [ ] Remote control (away from desk)
- [ ] Voice activation on mobile
- **Result:** JARVIS goes wherever you go

---

## API Keys & Credentials

All secrets stored in `.env` files — NEVER in source code or markdown.

| Service | Key Location | Status |
|---------|-------------|--------|
| OpenAI (GPT-4, Whisper, TTS) | `apps/orchestrator/.env` | Configured |
| Spotify | `apps/orchestrator/.env` | Needs OAuth setup |
| Amazon Alexa | `apps/orchestrator/.env` | Needs credentials |
| ElevenLabs (optional TTS) | `apps/orchestrator/.env` | Not configured |
| ChromaDB | Local instance | Needs Docker/local setup |

---

## Quick Start

```bash
# Frontend (works now)
cd JARVIS/apps/web
npm install && npm run dev
# → http://localhost:3000

# Orchestrator (needs OpenAI key in .env)
cd JARVIS/apps/orchestrator
npm install && npm run dev
# → http://localhost:3001

# Both together
./start-JARVIS.bat
```

---

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a0f` | Main background |
| Surface | `#12121a` | Cards, panels |
| Border | `#1e1e2e` | Subtle borders |
| Primary (Arc Reactor) | `#3b82f6` | Buttons, accents, glow |
| Cyan Glow | `#06b6d4` | Startup effects |
| Success | `#22c55e` | Online/connected |
| Error | `#ef4444` | Errors/alerts |
| Text Primary | `#f8fafc` | Main text |
| Text Secondary | `#94a3b8` | Muted text |

---

## Related Projects

| Project | What It Is | Relationship |
|---------|-----------|-------------|
| OpenClaw (`~/openclaw`) | Anthropic Claude agent framework + Telegram bot | Could serve as JARVIS brain alternative |
| Kimi Claw (`~/kimi-claw`) | Moonshot AI agent + Telegram bot | Separate AI bot |

---

*Last updated: 2026-02-25*
*Owner: Danny — the Tony Stark of Fraser Valley*
