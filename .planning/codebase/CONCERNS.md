# Codebase Concerns

**Analysis Date:** 2025-01-15

## Tech Debt

**Frontend not connected to Orchestrator:**
- Issue: Frontend (`apps/web/`) uses local mock `/api/chat` instead of calling orchestrator
- Files: `apps/web/src/app/api/chat/route.ts` (mock), `apps/orchestrator/src/index.ts` (real)
- Why: Layered development - frontend built first (Milestone 1), orchestrator second (Milestone 2)
- Impact: No real AI responses, no tool execution in frontend
- Fix approach: Update frontend to call `http://localhost:3001/api/chat` (orchestrator port)

**All tools default to mock mode:**
- Issue: Smart home, media, Bluetooth default to mock without credentials
- Files:
  - `apps/orchestrator/src/tools/smart-home.ts` (line ~7: `PROVIDER = "mock"`)
  - `apps/orchestrator/src/tools/media.ts` (line ~9: `MEDIA_PROVIDER = "mock"`)
  - `apps/orchestrator/src/tools/bluetooth.ts` (line ~47: `USE_REAL_BLUETOOTH`)
- Why: Allows development without external service credentials
- Impact: Tools don't actually control real devices until configured
- Fix approach: Document setup flow, guide users through OAuth credential setup

**Large monolithic tool files:**
- Issue: Each tool file (400-600 lines) contains multiple tool definitions
- Files: `apps/orchestrator/src/tools/pc-control.ts`, `smart-home.ts`, `media.ts`, `bluetooth.ts`
- Why: Rapid development, related tools grouped together
- Impact: Hard to navigate, test, and maintain individual tools
- Fix approach: Split into smaller files per tool or tool group

## Known Bugs

**No known bugs documented** - Testing is manual only

## Security Considerations

**PowerShell command injection risk:**
- Risk: User input passed to PowerShell commands could allow injection
- File: `apps/orchestrator/src/tools/pc-control.ts` (runPowerShell function)
- Current mitigation: String escaping with `.replace(/"/g, '\\"')`
- Recommendations: Add input validation, whitelist allowed commands/apps

**API keys in environment:**
- Risk: Credentials stored in .env.local could be exposed
- Files: `apps/orchestrator/.env.example` (documents required keys)
- Current mitigation: .env.local in .gitignore
- Recommendations: Add .env.local to .gitignore if not already, document secure key storage

**No authentication on orchestrator API:**
- Risk: Anyone on network could call orchestrator endpoints
- File: `apps/orchestrator/src/index.ts` (CORS allows all origins)
- Current mitigation: Local development only assumption
- Recommendations: Add API key auth or JWT before network deployment

## Performance Bottlenecks

**Conversation memory unbounded:**
- Problem: Conversations stored in memory without size limit
- File: `apps/orchestrator/src/services/conversation.ts`
- Measurement: Not measured, but grows with usage
- Cause: No message limit per conversation, no conversation limit
- Improvement path: Add max messages per conversation, implement conversation pruning

**No response caching:**
- Problem: Every request goes to OpenAI API
- File: `apps/orchestrator/src/services/openai.ts`
- Impact: Latency and API costs for repeated queries
- Improvement path: Cache common responses, implement semantic caching

## Fragile Areas

**Intent classification regex-based:**
- File: `apps/orchestrator/src/services/intent.ts`
- Why fragile: Keyword matching doesn't handle natural language variations
- Common failures: Ambiguous requests misclassified
- Safe modification: Add more keywords, test edge cases
- Test coverage: None

**Tool parameter parsing:**
- File: `apps/orchestrator/src/index.ts` (lines ~160-190)
- Why fragile: JSON.parse on tool arguments without validation
- Common failures: Malformed JSON from OpenAI crashes tool execution
- Safe modification: Add try/catch, validate against parameter schema
- Test coverage: None

## Scaling Limits

**In-memory conversation storage:**
- Current capacity: Limited by Node.js heap (~1.7GB default)
- Limit: ~10,000 conversations estimated before memory pressure
- Symptoms at limit: Slow responses, eventual OOM crash
- Scaling path: Move to Redis or database for conversation storage

**Single Node.js process:**
- Current capacity: One user effectively (local assistant)
- Limit: Single concurrent user assumed
- Symptoms at limit: Request queuing, slow responses
- Scaling path: Not needed for personal assistant use case

## Dependencies at Risk

**No outdated dependencies identified** - Fresh codebase

**Potential concerns:**
- `openai` package - Frequent API changes, may need updates
- `@fastify/websocket` - WebSocket not yet implemented

## Missing Critical Features

**Voice I/O (Milestone 4):**
- Problem: No speech-to-text or text-to-speech
- Current workaround: Text chat only
- Blocks: "Hey Jarvis" wake word, voice responses
- Implementation complexity: High (OpenAI Whisper + TTS integration)

**Frontend-Orchestrator connection:**
- Problem: Real AI not working in UI
- Current workaround: Mock responses in frontend
- Blocks: Actual Jarvis functionality
- Implementation complexity: Low (API URL change + CORS)

**Orchestrator dependencies not installed:**
- Problem: `apps/orchestrator/node_modules` may not exist
- File: `apps/orchestrator/package.json`
- Blocks: Running orchestrator server
- Fix: `cd apps/orchestrator && npm install`

**No git repository history:**
- Problem: No commits, no version tracking
- Impact: Can't track changes, no git bisect, no blame
- Fix: Initialize git, create initial commit

## Test Coverage Gaps

**Entire codebase:**
- What's not tested: Everything (no test files exist)
- Risk: Regressions go unnoticed
- Priority: High for services and tools
- Difficulty to test: Medium - need to mock external APIs

**Priority test targets:**
1. Intent classification accuracy
2. Tool execution success/failure
3. Conversation state management
4. Error handling paths

---

*Concerns audit: 2025-01-15*
*Update as issues are fixed or new ones discovered*
