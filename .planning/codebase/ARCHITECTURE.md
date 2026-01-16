# Architecture

**Analysis Date:** 2025-01-15

## Pattern Overview

**Overall:** Monorepo with 4-Layer AI Assistant Architecture

**Key Characteristics:**
- Separation of concerns across layers (UI, Orchestrator, Tools, Voice)
- Tool-based extensibility via registry pattern
- Streaming responses for real-time AI interaction
- Mock-first development for all integrations

## Layers

**Layer 1: Frontend UI (`apps/web/`)**
- Purpose: User interface and interaction
- Contains: React components, Next.js pages, API routes (stub)
- Location: `apps/web/src/`
- Status: COMPLETE (Milestone 1)
- Features: Chat panel, Control Center, startup sequence

**Layer 2: Orchestrator API (`apps/orchestrator/`)**
- Purpose: Central routing, context management, tool selection
- Contains: Fastify server, OpenAI integration, intent classification
- Location: `apps/orchestrator/src/`
- Status: IN PROGRESS (Milestone 2)
- Depends on: Layer 3 tools
- Used by: Layer 1 frontend (not yet connected)

**Layer 3: Backend Tools (`apps/orchestrator/src/tools/`)**
- Purpose: PC control, smart home, media, Bluetooth integrations
- Contains: Tool implementations with registry pattern
- Location: `apps/orchestrator/src/tools/`
- Status: SUBSTANTIALLY BUILT
- Depends on: External APIs, Windows PowerShell
- Used by: Layer 2 orchestrator

**Layer 4: Voice + Vision I/O (Planned)**
- Purpose: Speech recognition, TTS, wake word, computer vision
- Contains: Not yet implemented
- Status: NOT STARTED (Milestone 4)

## Data Flow

**Chat Request Lifecycle:**

1. User sends message via frontend chat input
2. Frontend POSTs to `/api/chat` (currently local stub)
3. **(Planned)** Frontend calls orchestrator `/api/chat`
4. Orchestrator adds message to conversation context
5. Orchestrator classifies intent via `services/intent.ts`
6. OpenAI streaming completion with function calling
7. If tool call detected: execute via tool registry
8. Stream response chunks back as SSE
9. Frontend renders streaming response
10. Conversation state saved in memory

**Tool Execution Flow:**

1. OpenAI returns tool_call in stream
2. Parse tool name and arguments
3. Look up tool in registry (`tools/registry.ts`)
4. Execute tool's `execute()` method
5. Return result to stream
6. Optionally continue with more tool calls

**State Management:**
- Conversations: In-memory Map with cleanup timer
- Tool state: Each tool manages its own state (lights, media)
- No persistent database

## Key Abstractions

**Tool:**
- Purpose: Encapsulate external capability (PC control, lights, music)
- Interface: `{ name, description, category, parameters, execute }`
- Location: `apps/orchestrator/src/tools/*.ts`
- Pattern: Registry pattern with dynamic registration
- Examples: `open_application`, `set_light_color`, `play_music`

**Service:**
- Purpose: Business logic modules
- Location: `apps/orchestrator/src/services/`
- Examples:
  - `openai.ts` - AI completion with streaming
  - `conversation.ts` - Conversation state management
  - `intent.ts` - Message intent classification

**React Component:**
- Purpose: UI building blocks
- Location: `apps/web/src/components/`
- Pattern: Functional components with hooks
- Examples: `ChatPanel.tsx`, `ToolControlPanel.tsx`, `StartupSequence.tsx`

## Entry Points

**Frontend Entry:**
- Location: `apps/web/src/app/page.tsx`
- Triggers: Browser navigation to /
- Responsibilities: Render main app, manage startup sequence

**API Routes (Frontend Stub):**
- Location: `apps/web/src/app/api/chat/route.ts`
- Triggers: POST /api/chat
- Responsibilities: Stream mock responses (to be replaced)

**Orchestrator Entry:**
- Location: `apps/orchestrator/src/index.ts`
- Triggers: `npm run dev` or `npm start`
- Responsibilities: Initialize Fastify, register tools, start server

## Error Handling

**Strategy:** Try/catch at boundaries, log and return error responses

**Patterns:**
- Orchestrator: Catch in route handlers, return error SSE event
- Tools: Return `{ success: false, error: message }` result
- Frontend: Display error in chat panel

## Cross-Cutting Concerns

**Logging:**
- Pino via Fastify logger
- Structured logging with request context
- Pretty print in development

**Configuration:**
- Environment variables via `process.env`
- Config module at `apps/orchestrator/src/config/index.ts`
- Defaults for mock mode operation

**CORS:**
- Enabled via `@fastify/cors`
- All origins allowed in development

---

*Architecture analysis: 2025-01-15*
*Update when major patterns change*
