# Roadmap: JARVIS

## Overview

Transform the existing Jarvis codebase from a working prototype into a fully functional Iron Man-style AI assistant. The journey starts with connecting the frontend to the real orchestrator, then adds voice capabilities (input via Whisper, output via TTS, wake word detection), integrates real smart home and media control, and culminates with morning routines, proactive suggestions, and seamless Windows integration.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Frontend-Orchestrator Connection** - Wire real AI responses to UI
- [ ] **Phase 2: Orchestrator Hardening** - Error handling, logging, stability
- [ ] **Phase 3: Voice Input** - Speech-to-text with OpenAI Whisper
- [ ] **Phase 4: Voice Output** - British accent TTS responses
- [ ] **Phase 5: Wake Word Detection** - "Hey Jarvis" activation
- [ ] **Phase 6: Alexa Integration** - Real smart home control
- [ ] **Phase 7: Spotify Integration** - Real music control
- [ ] **Phase 8: Morning Routine** - Auto-start, briefing, mood setting
- [ ] **Phase 9: Proactive Suggestions** - Context-aware anticipation
- [ ] **Phase 10: Windows Auto-Start** - Boot integration and system tray

## Phase Details

### Phase 1: Frontend-Orchestrator Connection
**Goal**: Real AI responses in the UI - Jarvis actually responds via GPT-4
**Depends on**: Nothing (first phase)
**Research**: Unlikely (internal wiring, established patterns)
**Plans**: TBD

Key work:
- Update frontend to call orchestrator API instead of local mock
- Configure CORS for local development
- Handle SSE streaming in frontend
- Test end-to-end chat flow with tool execution

### Phase 2: Orchestrator Hardening
**Goal**: Production-ready error handling and stability
**Depends on**: Phase 1
**Research**: Unlikely (internal patterns)
**Plans**: TBD

Key work:
- Add comprehensive error handling
- Improve logging with structured output
- Add request validation
- Handle edge cases (disconnections, timeouts, malformed input)

### Phase 3: Voice Input
**Goal**: Talk to Jarvis via microphone using OpenAI Whisper
**Depends on**: Phase 2
**Research**: Likely (OpenAI Whisper API)
**Research topics**: Whisper API streaming, browser audio recording, format requirements
**Plans**: TBD

Key work:
- Add microphone recording in frontend
- Send audio to orchestrator
- Integrate OpenAI Whisper for speech-to-text
- Wire transcribed text into chat flow

### Phase 4: Voice Output
**Goal**: Jarvis speaks responses with British accent
**Depends on**: Phase 3
**Research**: Likely (OpenAI TTS API)
**Research topics**: TTS API voice options, British voice selection, audio streaming/playback
**Plans**: TBD

Key work:
- Integrate OpenAI TTS API in orchestrator
- Select appropriate British voice
- Stream audio to frontend
- Play audio responses automatically

### Phase 5: Wake Word Detection
**Goal**: "Hey Jarvis" activates listening without button press
**Depends on**: Phase 4
**Research**: Likely (new capability, library selection)
**Research topics**: Wake word libraries (Porcupine, Snowboy), browser always-on audio, power efficiency
**Plans**: TBD

Key work:
- Evaluate and integrate wake word library
- Implement always-on listening in frontend
- Handle false positives/negatives
- Visual feedback when activated

### Phase 6: Alexa Integration
**Goal**: Real control of smart home devices via Alexa
**Depends on**: Phase 1
**Research**: Likely (external API, OAuth)
**Research topics**: Alexa Smart Home API, OAuth token flow, device discovery, command execution
**Plans**: TBD

Key work:
- Set up Alexa developer account and OAuth
- Implement token refresh flow
- Discover and cache available devices
- Execute real commands (lights on/off, brightness, color)

### Phase 7: Spotify Integration
**Goal**: Real music control via Spotify
**Depends on**: Phase 1
**Research**: Likely (external API, OAuth)
**Research topics**: Spotify Web API current docs, OAuth PKCE flow, playback control
**Plans**: TBD

Key work:
- Set up Spotify developer app and OAuth
- Implement token refresh flow
- Search, play, pause, skip, volume control
- Handle premium vs free limitations

### Phase 8: Morning Routine
**Goal**: Full Tony Stark morning experience
**Depends on**: Phases 4, 6, 7
**Research**: Unlikely (combines existing capabilities)
**Plans**: TBD

Key work:
- Define morning routine triggers (time-based, manual)
- Compose routine: greeting → weather → calendar → news
- Integrate with lights (set mood)
- Integrate with music (morning playlist)
- Store routine preferences

### Phase 9: Proactive Suggestions
**Goal**: Jarvis anticipates needs and offers help
**Depends on**: Phase 8
**Research**: Unlikely (internal logic using GPT-4 context)
**Plans**: TBD

Key work:
- Track user patterns and context
- Generate contextual suggestions via GPT-4
- Non-intrusive notification system
- User preference for suggestion frequency

### Phase 10: Windows Auto-Start
**Goal**: Jarvis starts with Windows and runs in background
**Depends on**: Phase 5
**Research**: Likely (Windows-specific integration)
**Research topics**: Windows startup registry, system tray apps, Electron vs native, background service
**Plans**: TBD

Key work:
- Add to Windows startup
- System tray icon with quick actions
- Background service for wake word
- Graceful startup/shutdown

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → ... → 10
Phases 6 and 7 can run in parallel after Phase 1 (no dependencies on each other).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Frontend-Orchestrator Connection | 0/TBD | Not started | - |
| 2. Orchestrator Hardening | 0/TBD | Not started | - |
| 3. Voice Input | 0/TBD | Not started | - |
| 4. Voice Output | 0/TBD | Not started | - |
| 5. Wake Word Detection | 0/TBD | Not started | - |
| 6. Alexa Integration | 0/TBD | Not started | - |
| 7. Spotify Integration | 0/TBD | Not started | - |
| 8. Morning Routine | 0/TBD | Not started | - |
| 9. Proactive Suggestions | 0/TBD | Not started | - |
| 10. Windows Auto-Start | 0/TBD | Not started | - |
