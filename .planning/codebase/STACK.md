# Technology Stack

**Analysis Date:** 2025-01-15

## Languages

**Primary:**
- TypeScript 5.x - All application code across frontend and orchestrator

**Secondary:**
- JavaScript - Build scripts, config files (next.config.js, postcss.config.js)

## Runtime

**Environment:**
- Node.js 18+ (required per README)
- Browser runtime for Next.js frontend

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present in `apps/web/`

## Frameworks

**Core:**
- Next.js 14 (App Router) - Frontend UI at `apps/web/`
- Fastify - Orchestrator API at `apps/orchestrator/`

**UI:**
- React 18 - Component framework
- Tailwind CSS - Styling

**Build/Dev:**
- TypeScript compiler - Type checking and compilation
- PostCSS - CSS processing

## Key Dependencies

**Frontend (`apps/web/package.json`):**
- next - React framework with App Router
- react, react-dom - UI library
- tailwindcss - Utility-first CSS

**Orchestrator (`apps/orchestrator/package.json`):**
- fastify - High-performance HTTP server
- @fastify/cors - CORS support
- @fastify/websocket - WebSocket support
- openai - OpenAI API client for GPT-4
- pino-pretty - Logging

**Shared:**
- typescript - Type system

## Configuration

**Environment:**
- `.env.local` for secrets (gitignored)
- `.env.example` documents required variables
- Key env vars:
  - `OPENAI_API_KEY` - GPT-4 API access
  - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` - Spotify integration
  - `ALEXA_CLIENT_ID`, `ALEXA_CLIENT_SECRET`, `ALEXA_REFRESH_TOKEN` - Alexa smart home
  - `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN` - Home Assistant alternative
  - `SMART_HOME_PROVIDER` - "alexa", "homeassistant", or "mock"
  - `MEDIA_PROVIDER` - "spotify" or "mock"
  - `USE_REAL_BLUETOOTH` - "true" to use real Windows Bluetooth

**Build:**
- `tsconfig.json` - TypeScript configuration in both apps
- `next.config.js` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS plugins

## Platform Requirements

**Development:**
- Windows (primary target for PC control features)
- Node.js 18+
- PowerShell (for PC control, Bluetooth tools)

**Production:**
- Windows PC for full functionality (PC control, Bluetooth)
- Can run on any platform in mock mode

---

*Stack analysis: 2025-01-15*
*Update after major dependency changes*
