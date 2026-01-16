# External Integrations

**Analysis Date:** 2025-01-15

## APIs & External Services

**AI/LLM:**
- OpenAI GPT-4 - Core AI responses and tool execution
  - SDK/Client: `openai` npm package in `apps/orchestrator/src/services/openai.ts`
  - Auth: API key in `OPENAI_API_KEY` env var
  - Features: Streaming chat completion, function calling for tools

**Music/Media:**
- Spotify API - Music playback control
  - SDK/Client: REST API via fetch in `apps/orchestrator/src/tools/media.ts`
  - Auth: OAuth2 with refresh token in `SPOTIFY_*` env vars
  - Features: Play/pause, search, playlists, volume control
  - Endpoints: /v1/me/player/*, search, playlists

**Smart Home:**
- Amazon Alexa API - Light and device control
  - SDK/Client: REST API in `apps/orchestrator/src/tools/smart-home.ts`
  - Auth: OAuth2 with refresh token in `ALEXA_*` env vars
  - Features: Light on/off, brightness, color control

- Home Assistant (Alternative) - Smart home control
  - SDK/Client: REST API in `apps/orchestrator/src/tools/smart-home.ts`
  - Auth: Long-lived access token in `HOME_ASSISTANT_TOKEN`
  - URL: Configurable via `HOME_ASSISTANT_URL`

## Data Storage

**Databases:**
- None - Stateless design, in-memory conversation storage

**File Storage:**
- None - No persistent file storage

**Caching:**
- In-memory only - Conversation context cached in Node.js process

## Authentication & Identity

**Auth Provider:**
- None implemented yet
- Planned: User personalization (currently hardcoded "Danny")

**OAuth Integrations:**
- Spotify OAuth - Music control authorization
- Amazon Alexa OAuth - Smart home authorization

## Monitoring & Observability

**Logging:**
- Pino - Structured logging via Fastify
  - Config: `pino-pretty` for colorized dev output
  - Levels: info, warn, error

**Error Tracking:**
- None (console.error only)

**Analytics:**
- None

## PC Integration

**Windows APIs:**
- PowerShell - System automation bridge
  - Implementation: `apps/orchestrator/src/tools/pc-control.ts`
  - Features: Open/close apps, window management, system info

**Bluetooth:**
- Windows Bluetooth API via PowerShell
  - Implementation: `apps/orchestrator/src/tools/bluetooth.ts`
  - Features: Device discovery, connect/disconnect, battery status

## Environment Configuration

**Development:**
- Required env vars: `OPENAI_API_KEY` (minimum for AI features)
- Optional: Spotify, Alexa credentials for full functionality
- Mock mode: All tools default to mock when credentials not provided
- Config: `.env.local` (gitignored), `.env.example` as template

**Production:**
- Same as development - no separate deployment target yet
- Runs locally on user's Windows PC

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Mock Modes

All integrations support mock mode for development without credentials:

| Integration | Mock Trigger | Behavior |
|-------------|--------------|----------|
| Smart Home | `SMART_HOME_PROVIDER=mock` (default) | Simulated lights with state |
| Media | `MEDIA_PROVIDER=mock` (default) | Simulated playlists and playback |
| Bluetooth | `USE_REAL_BLUETOOTH!=true` | Mock device list |
| PC Control | N/A | Always real (PowerShell) |

---

*Integration audit: 2025-01-15*
*Update when adding/removing external services*
