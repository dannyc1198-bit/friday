# Testing Patterns

**Analysis Date:** 2025-01-15

## Test Framework

**Runner:**
- Not configured
- No test files present in codebase

**Assertion Library:**
- Not configured

**Run Commands:**
```bash
# No test commands defined in package.json
```

## Test File Organization

**Location:**
- No test files exist
- Suggested pattern: `*.test.ts` alongside source files

**Naming:**
- Not established

**Structure:**
- Not established

## Coverage

**Requirements:**
- None defined

**Current Status:**
- 0% coverage (no tests exist)

## Test Types

**Unit Tests:**
- Not implemented
- Priority areas:
  - `apps/orchestrator/src/services/intent.ts` - Intent classification
  - `apps/orchestrator/src/services/conversation.ts` - Conversation management
  - Tool execute functions

**Integration Tests:**
- Not implemented
- Priority areas:
  - Chat endpoint flow
  - Tool execution pipeline

**E2E Tests:**
- Not implemented
- Would require browser automation for frontend

## Recommendations

**Test Framework Setup:**
```bash
# For orchestrator (Node.js)
npm install -D vitest

# For frontend (Next.js)
npm install -D vitest @testing-library/react
```

**Priority Test Areas:**

1. **Intent Classification (`apps/orchestrator/src/services/intent.ts`)**
   - Test: Message categorization accuracy
   - Test: Edge cases (empty, ambiguous messages)

2. **Tool Registry (`apps/orchestrator/src/tools/registry.ts`)**
   - Test: Tool registration
   - Test: Tool execution
   - Test: Invalid tool handling

3. **Conversation Service (`apps/orchestrator/src/services/conversation.ts`)**
   - Test: Create conversation
   - Test: Add messages
   - Test: Cleanup old conversations

4. **OpenAI Service (`apps/orchestrator/src/services/openai.ts`)**
   - Test: Streaming response parsing
   - Test: Tool call extraction
   - Test: Error handling

**Mock Patterns (Future):**
```typescript
// Mock OpenAI for testing
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn()
      }
    }
  }
}));

// Mock PowerShell for PC control tests
vi.mock('child_process', () => ({
  exec: vi.fn()
}));
```

## Manual Testing

Currently, testing is manual:

1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Watch Iron Man startup sequence
4. Type messages and verify JARVIS responds
5. Press Ctrl+K to open Control Center
6. Test tool tabs (PC, Bluetooth, Smart Home)

---

*Testing analysis: 2025-01-15*
*Update when test infrastructure is added*
