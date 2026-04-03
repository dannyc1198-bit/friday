# JARVIS - Personal AI Assistant

## What This Is

A high-tech, Iron Man-inspired personal AI assistant for Danny with voice control, smart home integration (Alexa), and Windows PC automation. Built with a modular 4-layer architecture (Frontend UI, Orchestrator API, Backend Tools, Voice I/O) to enable natural conversation and proactive assistance.

## Core Value

**Make JARVIS feel alive** - British accent voice, witty personality, proactive suggestions, and seamless control of lights, music, and PC. The goal is the full Tony Stark experience: JARVIS greets you in the morning, sets the mood, and anticipates your needs.

## Requirements

### Validated

- ✓ Iron Man startup sequence with personalized greeting - existing
- ✓ Chat UI with streaming responses - existing
- ✓ Control Center (Ctrl+K) with PC/Bluetooth/Smart Home tabs - existing
- ✓ Orchestrator API with OpenAI GPT-4 integration - existing
- ✓ Tool registry with function calling - existing
- ✓ PC control via PowerShell (open/close apps, system info) - existing
- ✓ Smart home tools with Alexa API support - existing
- ✓ Media tools with Spotify API support - existing
- ✓ Bluetooth tools with Windows API support - existing

### Active

- [ ] Frontend connected to Orchestrator API (real AI responses)
- [ ] Voice input with OpenAI Whisper
- [ ] Voice output with OpenAI TTS (British accent)
- [ ] Wake word detection ("Hey JARVIS")
- [ ] Alexa integration configured with real credentials
- [ ] Morning routine automation (auto-start, briefing, mood setting)
- [ ] Proactive suggestions based on context
- [ ] Windows auto-start on login

### Out of Scope

- Mobile app (React Native) — Focus on desktop experience first
- Multi-user support — Built for Danny only, no auth needed
- Cloud deployment — Runs locally on Danny's Windows PC
- Computer vision (GPT-4 Vision) — Voice-first, vision can come later

## Context

**Existing Architecture:**
The codebase follows a 4-layer architecture documented in `.planning/codebase/ARCHITECTURE.md`:
1. Frontend UI (Next.js 14) - COMPLETE
2. Orchestrator API (Fastify) - BUILT, needs connection
3. Backend Tools - BUILT with mock defaults
4. Voice I/O - NOT STARTED

**Current State:**
- Frontend works standalone with mock responses
- Orchestrator has full tool execution capability
- All tools default to mock mode until credentials configured
- No git history prior to codebase mapping

**Smart Home Setup:**
- Danny has Amazon Alexa devices
- Need to configure Alexa API credentials for real control

**Key Technical Decisions:**
- OpenAI for AI (GPT-4), speech (Whisper), and voice (TTS)
- Fastify for high-performance API
- PowerShell bridge for Windows automation
- SSE for streaming responses

## Constraints

- **Platform**: Windows-only for PC control features (PowerShell dependency)
- **Local-first**: Runs on Danny's PC, no cloud deployment
- **API Dependencies**: Requires OpenAI API key, optional Spotify/Alexa credentials

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 4-layer architecture | Separation of concerns, context isolation | ✓ Good |
| Mock-first tools | Development without external credentials | ✓ Good |
| OpenAI for all AI | Unified API for chat, speech, TTS | — Pending |
| Fastify over Express | Higher performance for streaming | ✓ Good |
| PowerShell for PC control | Native Windows integration | ✓ Good |

---
*Last updated: 2025-01-15 after initialization*
