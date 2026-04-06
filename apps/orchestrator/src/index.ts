import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { config } from "./config/index.js";
import { initializeTools, toolRegistry } from "./tools/index.js";
import {
  createConversation,
  getOrCreateConversation,
  addUserMessage,
  addAssistantMessage,
  getMessages,
  cleanupOldConversations,
} from "./services/conversation.js";
import { streamChatCompletion } from "./services/openai.js";
import { streamChatWithRouting } from "./services/llm-router.js";
import { classifyIntent, requiresToolExecution } from "./services/intent.js";
import { memoryService } from "./services/memory/index.js";
import { textToSpeech, isTTSAvailable, stripForTTS } from "./services/tts.js";
import { receptionistRoutes } from "./routes/receptionist.js";
import type { StreamChunk } from "./types/index.js";

// ─── Unified Brain Systems ──────────────────────────────────────
import { authMiddleware, initAuth } from "./middleware/auth.js";
import { unifiedMemory } from "./services/unified-memory.js";
import { classifyAgent, dispatchToAgent, getActiveTasks, getAgentRosterPrompt } from "./services/agent-dispatch.js";
import { learningEngine } from "./services/learning-engine.js";
import { buildFullMemoryContext, saveConversationSummary, recordBehavioralPattern } from "./services/memory-loader.js";
import { proactiveMonitor } from "./services/proactive-monitor.js";
import { getMorningBriefing } from "./services/morning-briefing.js";
import { marketMonitor } from "./services/market-monitor.js";

// Constants
const MAX_MESSAGE_LENGTH = 4000;

// Active task abort controllers — keyed by conversationId
const activeAbortControllers = new Map<string, AbortController>();

// Initialize Fastify
const app = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  },
});

// Register plugins
await app.register(cors, {
  origin: [config.corsOrigin, "http://localhost:3000"],
  credentials: true,
});

await app.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
});

await app.register(websocket);

// ─── Authentication ─────────────────────────────────────────────
initAuth();
app.addHook("onRequest", authMiddleware);

// Virtual Receptionist routes (VAPI webhook + status)
await app.register(receptionistRoutes, { prefix: "/api/receptionist" });

// Initialize tools
initializeTools();

// Initialize long-term memory
memoryService.initialize().then((connected) => {
  if (connected) {
    console.log("  ✓ Long-term memory (ChromaDB) connected");
  } else {
    console.log("  ⚠ Running without long-term memory");
  }
});

// ─── Initialize Unified Brain Systems ───────────────────────────
console.log("🧠 Initializing Unified Brain...");

// Sync unified memory with OpenClaw workspace
try {
  const syncResult = unifiedMemory.syncWithOpenClaw();
  console.log(`  ✓ Unified Memory: ${syncResult.imported} imported, ${syncResult.exported} exported`);
} catch (error) {
  console.log("  ⚠ Unified Memory: running in local-only mode");
}

// Initialize learning engine context
const learningStats = learningEngine.getStats();
console.log(`  ✓ Learning Engine: ${learningStats.totalInteractions} interactions tracked, ${(learningStats.successRate * 100).toFixed(0)}% success rate`);

// Log agent roster
console.log("  ✓ Agent Dispatch: 5 specialist agents registered (NEXUS, BUILDER, CREATOR, PULSE, CLAWDY)");

// Start proactive background monitor
proactiveMonitor.start();
console.log("  ✓ Proactive Monitor: running every 5 minutes (quiet hours 11pm–5am)");

// Start market price monitor — feeds HUD + fires alerts on big moves
marketMonitor.start();
marketMonitor.onAlert((message, symbol) => {
  // Queue into proactive monitor so frontend picks it up via /api/proactive/alerts
  proactiveMonitor.queueAlert({
    type: "crypto",
    priority: "high",
    title: `${symbol} price alert`,
    message,
  });
});
console.log("  ✓ Market Monitor: polling CoinGecko every 5 minutes (XRP, XLM, HBAR, BTC, ETH)");

// Health check endpoint
app.get("/api/health", async () => {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    service: "JARVIS-orchestrator",
    version: "1.0.0",
  };
});

// Get available tools
app.get("/api/tools", async () => {
  const tools = toolRegistry.getAllTools();
  return {
    count: tools.length,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      parameters: t.parameters,
    })),
  };
});

// Create new conversation
app.post("/api/conversations", async () => {
  const conversation = createConversation();
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
  };
});

// Chat endpoint with streaming
app.post<{
  Body: {
    message: string;
    conversationId?: string;
  };
}>("/api/chat", async (request, reply) => {
  const { message, conversationId } = request.body;

  if (!message || typeof message !== "string") {
    reply.code(400);
    return { error: "Message is required" };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    reply.code(400);
    return { error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.` };
  }

  // Get or create conversation
  const conversation = getOrCreateConversation(conversationId);

  // Add user message
  addUserMessage(conversation.id, message);

  // Classify intent for logging
  const intent = classifyIntent(message);
  app.log.info({ intent }, "Classified intent");

  // Set up SSE headers
  const allowedOrigins = [config.corsOrigin, "http://localhost:3000"];
  const requestOrigin = request.headers.origin || "";
  const sseOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : config.corsOrigin;
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": sseOrigin,
  });

  // Get conversation messages (system prompt handled internally by LLM service)
  const messages = getMessages(conversation.id);

  // ─── Unified Brain: Inject learned context ────────────────────
  // Append learning context and memory context to enhance the conversation
  const learningContext = learningEngine.buildLearningContext();
  const memoryContext = unifiedMemory.buildContextForPrompt(message);
  const agentContext = getAgentRosterPrompt();

  // Check if a specialist agent should handle this
  const targetAgent = classifyAgent(message);
  if (targetAgent) {
    app.log.info({ agent: targetAgent.name }, "Specialist agent match detected");
  }

  // Set up abort controller for this conversation (enables "JARVIS stop")
  const abortController = new AbortController();
  activeAbortControllers.set(conversation.id, abortController);

  let fullContent = "";
  const toolCalls: { name: string; arguments: string }[] = [];
  const toolResults: { toolCallId: string; success: boolean; data?: unknown; error?: string }[] = [];

  try {
    // Stream from Claude (tool execution handled by agentic loop in streamChatCompletion)
    const masterMemoryContext = buildFullMemoryContext();
    const brainContext = "\n\n" + masterMemoryContext + "\n" + learningContext + "\n" + memoryContext + "\n" + agentContext;
    for await (const chunk of streamChatWithRouting(messages, abortController.signal, brainContext)) {
      if (chunk.type === "text" && chunk.content) {
        fullContent += chunk.content;
        reply.raw.write(`data: ${JSON.stringify({ type: "text", content: chunk.content })}\n\n`);
      } else if (chunk.type === "tool_call" && chunk.toolCall) {
        // Tool execution happens inside streamChatCompletion — just forward the event
        toolCalls.push({
          name: chunk.toolCall.toolName,
          arguments: JSON.stringify(chunk.toolCall.parameters),
        });
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "tool_call",
            tool: chunk.toolCall.toolName,
            parameters: chunk.toolCall.parameters,
          })}\n\n`
        );
      } else if (chunk.type === "tool_result" && chunk.toolResult) {
        // Tool result from the agentic loop — forward to frontend
        toolResults.push({
          toolCallId: chunk.toolResult.toolCallId,
          success: chunk.toolResult.success,
          data: chunk.toolResult.data,
          error: chunk.toolResult.error,
        });
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "tool_result",
            tool: toolCalls[toolCalls.length - 1]?.name || "unknown",
            result: chunk.toolResult.data,
            success: chunk.toolResult.success,
          })}\n\n`
        );
      } else if (chunk.type === "error") {
        reply.raw.write(`data: ${JSON.stringify({ type: "error", content: chunk.content })}\n\n`);
      }
    }

    // Save assistant message
    addAssistantMessage(
      conversation.id,
      fullContent,
      toolCalls.length > 0
        ? toolCalls.map((tc, i) => ({
            id: `call-${i}`,
            toolName: tc.name,
            parameters: JSON.parse(tc.arguments),
          }))
        : undefined,
      toolResults.length > 0 ? toolResults : undefined
    );

    // ─── Learning: Record outcome ─────────────────────────────────
    learningEngine.recordOutcome({
      action: fullContent.slice(0, 200),
      context: message.slice(0, 200),
      toolsUsed: toolCalls.map(tc => tc.name),
      agentUsed: targetAgent?.name,
      outcome: toolResults.some(tr => !tr.success) ? "partial" : "success",
    });

    // ─── Memory: Save conversation summary + detect patterns ────
    try {
      // Extract key facts from this exchange for cross-session memory
      const keyFacts: string[] = [];
      if (toolCalls.length > 0) {
        keyFacts.push(`Used tools: ${toolCalls.map(tc => tc.name).join(", ")}`);
      }
      if (targetAgent) {
        keyFacts.push(`Agent classified: ${targetAgent.name}`);
      }
      // Save daily conversation summary
      const summaryText = `User: ${message.slice(0, 100)} → JARVIS: ${fullContent.slice(0, 100)}`;
      saveConversationSummary(summaryText, keyFacts).catch(console.error);

      // Track behavioral patterns
      const hour = new Date().getHours();
      if (hour < 7) recordBehavioralPattern("Danny is active early morning (before 7 AM)").catch(console.error);
      else if (hour >= 20) recordBehavioralPattern("Danny is active late evening (after 8 PM)").catch(console.error);
      if (message.length < 20) recordBehavioralPattern("Danny prefers short messages").catch(console.error);
      if (toolCalls.length > 3) recordBehavioralPattern("This task required multi-tool execution").catch(console.error);
    } catch (e) {
      app.log.warn("Failed to save conversation memory");
    }

    // Sync unified memory periodically (every 50 interactions)
    if (learningEngine.getStats().totalInteractions % 50 === 0) {
      unifiedMemory.syncWithOpenClaw();
      learningEngine.detectPatterns();
    }

    // Send done event
    reply.raw.write(
      `data: ${JSON.stringify({
        type: "done",
        conversationId: conversation.id,
      })}\n\n`
    );
  } catch (error) {
    app.log.error({ error }, "Chat error");
    // Sanitize: never expose stack traces or internal details to frontend
    reply.raw.write(`data: ${JSON.stringify({ type: "error", content: "Something went wrong. Please try again." })}\n\n`);
  } finally {
    activeAbortControllers.delete(conversation.id);
    reply.raw.end();
  }
});

// Stop active task — "JARVIS, stop"
app.post<{
  Body: {
    conversationId?: string;
  };
}>("/api/stop", async (request) => {
  const { conversationId } = request.body || {};

  if (conversationId && activeAbortControllers.has(conversationId)) {
    activeAbortControllers.get(conversationId)!.abort();
    activeAbortControllers.delete(conversationId);
    return { stopped: true, conversationId };
  }

  // If no conversationId, stop ALL active tasks
  let stopped = 0;
  for (const [id, controller] of activeAbortControllers) {
    controller.abort();
    activeAbortControllers.delete(id);
    stopped++;
  }

  return { stopped: stopped > 0, count: stopped };
});

// Execute tool directly
app.post<{
  Body: {
    tool: string;
    parameters: Record<string, unknown>;
  };
}>("/api/tools/execute", async (request, reply) => {
  const { tool, parameters } = request.body;

  if (!tool || typeof tool !== "string") {
    reply.code(400);
    return { error: "Tool name is required" };
  }

  try {
    const result = await toolRegistry.execute(tool, parameters || {});
    return result;
  } catch (error) {
    app.log.error({ error, tool }, "Tool execution error");
    reply.code(500);
    return { error: "Tool execution failed. Check server logs for details." };
  }
});

// Classify intent endpoint
app.post<{
  Body: { message: string };
}>("/api/intent", async (request) => {
  const { message } = request.body;
  return classifyIntent(message || "");
});

// ─── Unified Brain Endpoints ────────────────────────────────────

// Agent dispatch — route a task to a specialist agent
app.post<{
  Body: { agentId: string; task: string; context?: Record<string, unknown> };
}>("/api/agents/dispatch", async (request, reply) => {
  const { agentId, task, context } = request.body;

  if (!agentId || !task) {
    reply.code(400);
    return { error: "agentId and task are required" };
  }

  try {
    const result = await dispatchToAgent(agentId, task, context);
    return result;
  } catch (error) {
    reply.code(500);
    return { error: error instanceof Error ? error.message : "Dispatch failed" };
  }
});

// Active agent tasks
app.get("/api/agents/tasks", async () => {
  return {
    tasks: getActiveTasks(),
    agentRoster: getAgentRosterPrompt(),
  };
});

// Unified memory search
app.post<{
  Body: { query: string; limit?: number };
}>("/api/memory/search", async (request) => {
  const { query, limit } = request.body;
  const results = unifiedMemory.search(query || "", limit || 10);
  return { count: results.length, results };
});

// Unified memory store
app.post<{
  Body: {
    content: string;
    category?: string;
    tags?: string[];
    importance?: string;
    agent?: string;
  };
}>("/api/memory/store", async (request) => {
  const { content, category, tags, importance, agent } = request.body;

  const id = unifiedMemory.store_entry({
    source: agent ? "agent" : "jarvis",
    agent: agent || "JARVIS",
    category: (category as any) || "fact",
    content,
    tags: tags || [],
    importance: (importance as any) || "medium",
    confidence: 1.0,
  });

  return { id, stored: true };
});

// Unified memory stats
app.get("/api/memory/stats", async () => {
  return unifiedMemory.getStats();
});

// Learning engine stats
app.get("/api/learning/stats", async () => {
  return {
    stats: learningEngine.getStats(),
    patterns: learningEngine.getPatterns(),
    strategies: learningEngine.getStrategies(),
  };
});

// Record feedback for learning
app.post<{
  Body: { feedback: string; outcomeId?: string };
}>("/api/learning/feedback", async (request) => {
  const { feedback, outcomeId } = request.body;
  learningEngine.processFeedback(feedback, outcomeId);
  return { recorded: true };
});

// System status — full unified brain health
app.get("/api/system/status", async () => {
  const memoryStats = unifiedMemory.getStats();
  const learning = learningEngine.getStats();
  const activeTasks = getActiveTasks();

  return {
    system: "JARVIS Unified Brain",
    version: "2.0.0",
    status: "online",
    timestamp: new Date().toISOString(),
    subsystems: {
      orchestrator: { status: "online", tools: toolRegistry.getToolCount() },
      unifiedMemory: { status: "online", entries: memoryStats.totalEntries },
      learningEngine: {
        status: "online",
        interactions: learning.totalInteractions,
        successRate: learning.successRate,
      },
      agentDispatch: {
        status: "online",
        activeTasks: activeTasks.length,
        agents: ["NEXUS", "BUILDER", "CREATOR", "PULSE", "CLAWDY"],
      },
    },
  };
});

// ─── Proactive Monitor Endpoints ────────────────────────────────

// Get pending (unread) alerts
app.get("/api/proactive/alerts", async () => {
  return { alerts: proactiveMonitor.getAlerts() };
});

// Mark a single alert as read
app.delete<{ Params: { id: string } }>("/api/proactive/alerts/:id", async (request, reply) => {
  const ok = proactiveMonitor.markRead(request.params.id);
  if (!ok) { reply.code(404); return { error: "Alert not found" }; }
  return { ok: true };
});

// Mark all alerts as read
app.delete("/api/proactive/alerts", async () => {
  proactiveMonitor.clearAll();
  return { ok: true };
});

// ─── Morning Briefing Endpoint ───────────────────────────────────

app.get("/api/briefing/morning", async () => {
  const briefing = await getMorningBriefing();
  return briefing;
});

// ─── Market Monitor Endpoints ────────────────────────────────────

// Get latest cached prices for all watched assets (HUD polling)
app.get("/api/market/prices", async () => {
  return { prices: marketMonitor.getPrices() };
});

// Force-refresh prices right now
app.post("/api/market/refresh", async () => {
  const prices = await marketMonitor.refreshNow();
  return { prices };
});

// List active custom price alerts
app.get("/api/market/alerts", async () => {
  return { alerts: marketMonitor.getCustomAlerts() };
});

// Add a custom price alert (e.g. "alert me when XRP hits $3")
app.post<{
  Body: { symbol: string; type: "price_above" | "price_below" | "change_pct"; threshold: number; note?: string }
}>("/api/market/alerts", async (request, reply) => {
  const { symbol, type, threshold, note } = request.body;
  if (!symbol || !type || threshold == null) {
    reply.code(400);
    return { error: "symbol, type, and threshold are required" };
  }
  const alert = marketMonitor.addCustomAlert({ symbol, type, threshold, note });
  return { alert };
});

// Remove a custom price alert
app.delete<{ Params: { id: string } }>("/api/market/alerts/:id", async (request, reply) => {
  const ok = marketMonitor.removeCustomAlert(request.params.id);
  if (!ok) { reply.code(404); return { error: "Alert not found" }; }
  return { ok: true };
});

// TTS endpoint — converts text to speech via ElevenLabs
// Rate limited to 30 req/min per Phase 1 security spec
app.post<{
  Body: {
    text: string;
  };
}>("/api/tts", {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: "1 minute",
    },
  },
}, async (request, reply) => {
  const { text } = request.body;

  if (!text || typeof text !== "string") {
    reply.code(400);
    return { error: "Text is required" };
  }

  if (text.length > 5000) {
    reply.code(400);
    return { error: "Text too long. Maximum 5000 characters." };
  }

  // Check TTS availability
  if (!isTTSAvailable()) {
    reply.code(503);
    return { error: "TTS unavailable — no ElevenLabs API key configured", fallback: true };
  }

  try {
    const audioBuffer = await textToSpeech(text);

    if (!audioBuffer) {
      reply.code(503);
      return { error: "TTS generation failed", fallback: true };
    }

    reply.header("Content-Type", "audio/mpeg");
    reply.header("Content-Length", audioBuffer.length);
    reply.header("Cache-Control", "no-cache");
    return reply.send(audioBuffer);
  } catch (err) {
    app.log.error({ err }, "TTS endpoint error");
    reply.code(500);
    return { error: "TTS generation failed", fallback: true };
  }
});

// TTS availability check (lightweight — no audio generation)
app.get("/api/tts/status", async () => {
  return {
    available: isTTSAvailable(),
    provider: "elevenlabs",
    voice: config.elevenlabs.voiceId,
  };
});

// ─── Sidecar Bridge Endpoints ────────────────────────────────

// Sidecar event receiver — sidecar pushes events here for learning + memory
app.post<{
  Body: { type: string; data: Record<string, unknown> };
}>("/api/sidecar/events", async (request) => {
  const { type, data } = request.body;
  app.log.info({ type, data }, "Sidecar event received");

  // Record in learning engine
  try {
    learningEngine.recordOutcome({
      action: `sidecar_${type}`,
      context: JSON.stringify(data).slice(0, 200),
      toolsUsed: [`sidecar_${type}`],
      outcome: "success",
    });
  } catch (e) {
    app.log.warn("Failed to record sidecar event in learning engine");
  }

  // Store notable events in unified memory
  if (type === "security" || type === "greeting") {
    try {
      unifiedMemory.store_entry({
        source: "jarvis",
        agent: "sidecar",
        category: type === "security" ? "interaction" : "fact",
        content: `[Sidecar ${type}] ${JSON.stringify(data)}`,
        tags: ["sidecar", type],
        importance: type === "security" ? "high" : "medium",
        confidence: 0.9,
      });
    } catch (e) {
      app.log.warn("Failed to store sidecar event in unified memory");
    }
  }

  return { ok: true };
});

// Cleanup old conversations periodically
setInterval(
  () => {
    cleanupOldConversations(24 * 60 * 60 * 1000); // 24 hours
  },
  60 * 60 * 1000
); // Every hour

// Start server
const start = async () => {
  try {
    // Bind to localhost only — prevents network exposure without auth
    const bindHost = process.env.JARVIS_BIND_HOST || "127.0.0.1";
    const address = await app.listen({
      port: config.port,
      host: bindHost,
    });

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║       ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗                  ║
║       ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝                  ║
║       ██║███████║██████╔╝██║   ██║██║███████╗                  ║
║  ██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║                  ║
║  ╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║                  ║
║   ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝                  ║
║                                                                ║
║        Just A Rather Very Intelligent System                   ║
║        UNIFIED BRAIN v2.0 — OpenClaw Orchestrated              ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║   Orchestrator:  ${address.padEnd(43)}║
║   User:          ${config.userName.padEnd(43)}║
║   Auth:          Bearer token (JARVIS_API_KEY)                 ║
║   Binding:       ${bindHost.padEnd(43)}║
║                                                                ║
║   Core Endpoints:                                              ║
║   • POST /api/chat            - Chat with streaming            ║
║   • GET  /api/tools           - List ${String(toolRegistry.getToolCount()).padEnd(3)} tools               ║
║   • POST /api/tools/execute   - Direct tool execution          ║
║   • POST /api/stop            - Cancel active tasks            ║
║                                                                ║
║   Unified Brain:                                               ║
║   • POST /api/agents/dispatch - Route to specialist agent      ║
║   • GET  /api/agents/tasks    - Active agent tasks             ║
║   • POST /api/memory/search   - Search unified memory          ║
║   • GET  /api/learning/stats  - Learning engine insights       ║
║   • GET  /api/system/status   - Full brain health              ║
║                                                                ║
║   Agents: NEXUS | BUILDER | CREATOR | PULSE | CLAWDY           ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Clean shutdown — stop background services
process.on("SIGINT", () => { proactiveMonitor.stop(); marketMonitor.stop(); process.exit(0); });
process.on("SIGTERM", () => { proactiveMonitor.stop(); marketMonitor.stop(); process.exit(0); });

start();
