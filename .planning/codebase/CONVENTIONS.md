# Coding Conventions

**Analysis Date:** 2025-01-15

## Naming Patterns

**Files:**
- kebab-case for utility files (pc-control.ts, smart-home.ts)
- PascalCase for React components (ChatPanel.tsx, StartupSequence.tsx)
- lowercase for config files (tsconfig.json, next.config.js)
- index.ts for barrel exports

**Functions:**
- camelCase for all functions (streamChatCompletion, classifyIntent)
- Async functions: no special prefix
- Handlers: handle* prefix for event handlers in React

**Variables:**
- camelCase for variables (conversationId, toolRegistry)
- UPPER_SNAKE_CASE for constants (PROVIDER, API_BASE_URL)
- Private: underscore prefix not used

**Types:**
- PascalCase for interfaces (Tool, Message, Conversation)
- PascalCase for type aliases (StreamChunk, ToolResult)
- No I prefix for interfaces

## Code Style

**Formatting:**
- 2 space indentation
- Double quotes for strings in most code
- Semicolons required
- Trailing commas in multi-line structures
- ~100 character line length (not strictly enforced)

**Linting:**
- No ESLint configuration present
- No Prettier configuration present
- Style enforced by convention, not tooling

## Import Organization

**Order:**
1. Node.js built-ins (child_process, util)
2. External packages (fastify, openai)
3. Internal modules (./services, ./tools)
4. Types (import type { })

**Grouping:**
- Blank line between groups
- Related imports grouped together

**Path Aliases:**
- None configured
- Relative imports used (./services, ../types)

## Error Handling

**Patterns:**
- Try/catch at function boundaries
- Errors logged then re-thrown or returned
- Async functions use try/catch, not .catch()

**Error Types:**
- Standard Error with descriptive messages
- Tool results return `{ success: false, error: message }`

**Logging:**
- console.warn for non-fatal issues
- Fastify logger for request-level logging

## Logging

**Framework:**
- Pino via Fastify built-in logger
- console.log/warn/error for tools

**Patterns:**
- Structured logging: `app.log.info({ intent }, 'Classified intent')`
- Error context included: `{ error }, 'Error message'`

## Comments

**When to Comment:**
- Explain complex logic
- Document API contracts
- Note TODOs and FIXMEs

**JSDoc/TSDoc:**
- Not consistently used
- Type annotations in TypeScript preferred

**TODO Comments:**
- Plain `// TODO: description` format

## Function Design

**Size:**
- No strict limit, but most functions under 50 lines
- Long functions in tools (200+ lines) due to multiple tool definitions

**Parameters:**
- Destructured objects for multiple params
- Type annotations on all parameters

**Return Values:**
- Explicit return types on public functions
- Async functions return Promise<T>

## Module Design

**Exports:**
- Named exports preferred
- Default exports for React components
- Barrel exports via index.ts

**Patterns:**
- Services as modules with exported functions
- Tools as objects conforming to Tool interface
- React components as function components

## React Patterns

**Components:**
- Functional components only (no classes)
- Hooks for state and effects
- Props destructured in parameters

**State:**
- useState for local state
- useEffect for side effects
- Custom hooks for reusable logic

**Styling:**
- Tailwind CSS classes inline
- Dark theme with blue accents (Iron Man aesthetic)
- Responsive design with Tailwind breakpoints

---

*Convention analysis: 2025-01-15*
*Update when patterns change*
