// FRIDAY orchestrator — SIMPLE edition (amputated 2026-04-20)
//
// Slim Fastify server: one model (Claude via openai.ts), one chat path,
// memory + tools + TTS + phone routes. No router, no swarm, no learning
// engine, no proactive monitor, no agent dispatch.
//
// Build the brain back organ-by-organ only after the core loop is verified
// stable under real traffic for at least a week.

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
import { memoryService } from "./services/memory/index.js";
import { textToSpeech, isTTSAvailable } from "./services/tts.js";
import { fridayPhoneRoutes } from "./routes/friday-phone.js";
import { openaiCompatRoutes } from "./routes/openai-compat.js";
import { authMiddleware, initAuth } from "./middleware/auth.js";
import { unifiedMemory } from "./services/unified-memory.js";
import {
  buildFullMemoryContext,
  saveConversationSummary,
} from "./services/memory-loader.js";

const MAX_MESSAGE_LENGTH = 4000;
const activeAbortControllers = new Map<string, AbortController>();

const app = Fastify({
  logger: {
    level: "info",
    transport: { target: "pino-pretty", options: { colorize: true } },
  },
});

await app.register(cors, {
  origin: [config.corsOrigin, "http://localhost:3000"],
  credentials: true,
});
await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
await app.register(websocket);

initAuth();
app.addHook("onRequest", authMiddleware);

await app.register(fridayPhoneRoutes, { prefix: "/api/friday-phone" });
await app.register(openaiCompatRoutes);

initializeTools();

memoryService.initialize().then((connected) => {
  console.log(connected ? "  ✓ Long-term memory (ChromaDB) connected" : "  ⚠ Running without long-term memory");
});

try {
  const syncResult = unifiedMemory.syncWithOpenClaw();
  console.log(`  ✓ Unified Memory: ${syncResult.imported} imported, ${syncResult.exported} exported`);
} catch {
  console.log("  ⚠ Unified Memory: local-only mode");
}

// ─── Core endpoints ─────────────────────────────────────────────

app.get("/api/health", async () => ({
  ok: true,
  timestamp: new Date().toISOString(),
  service: "FRIDAY-orchestrator",
  version: "2.1.0-simple",
}));

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

app.post("/api/conversations", async () => {
  const c = createConversation();
  return { id: c.id, createdAt: c.createdAt };
});

app.post<{ Body: { message: string; conversationId?: string } }>(
  "/api/chat",
  async (request, reply) => {
    const { message, conversationId } = request.body;

    if (!message || typeof message !== "string") {
      reply.code(400);
      return { error: "Message is required" };
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      reply.code(400);
      return { error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.` };
    }

    const conversation = getOrCreateConversation(conversationId);
    addUserMessage(conversation.id, message);

    const allowedOrigins = [config.corsOrigin, "http://localhost:3000"];
    const requestOrigin = request.headers.origin || "";
    const sseOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : config.corsOrigin;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": sseOrigin,
    });

    const messages = getMessages(conversation.id);

    // Single memory context injection — no router, no agent classifier, no learning engine
    const memoryContext = "\n\n" + buildFullMemoryContext() + "\n" + unifiedMemory.buildContextForPrompt(message);

    const abortController = new AbortController();
    activeAbortControllers.set(conversation.id, abortController);

    let fullContent = "";
    const toolCalls: { name: string; arguments: string }[] = [];
    const toolResults: { toolCallId: string; success: boolean; data?: unknown; error?: string }[] = [];

    try {
      for await (const chunk of streamChatCompletion(messages, abortController.signal, memoryContext)) {
        if (chunk.type === "text" && chunk.content) {
          fullContent += chunk.content;
          reply.raw.write(`data: ${JSON.stringify({ type: "text", content: chunk.content })}\n\n`);
        } else if (chunk.type === "tool_call" && chunk.toolCall) {
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

      // Lightweight memory save — fire and forget
      const summary = `User: ${message.slice(0, 100)} → FRIDAY: ${fullContent.slice(0, 100)}`;
      const keyFacts = toolCalls.length > 0 ? [`Used tools: ${toolCalls.map((t) => t.name).join(", ")}`] : [];
      saveConversationSummary(summary, keyFacts).catch(() => {});

      reply.raw.write(`data: ${JSON.stringify({ type: "done", conversationId: conversation.id })}\n\n`);
    } catch (error) {
      app.log.error({ error }, "Chat error");
      reply.raw.write(`data: ${JSON.stringify({ type: "error", content: "Something went wrong. Please try again." })}\n\n`);
    } finally {
      activeAbortControllers.delete(conversation.id);
      reply.raw.end();
    }
  }
);

app.post<{ Body: { conversationId?: string } }>("/api/stop", async (request) => {
  const { conversationId } = request.body || {};
  if (conversationId && activeAbortControllers.has(conversationId)) {
    activeAbortControllers.get(conversationId)!.abort();
    activeAbortControllers.delete(conversationId);
    return { stopped: true, conversationId };
  }
  let stopped = 0;
  for (const [id, controller] of activeAbortControllers) {
    controller.abort();
    activeAbortControllers.delete(id);
    stopped++;
  }
  return { stopped: stopped > 0, count: stopped };
});

app.post<{ Body: { tool: string; parameters: Record<string, unknown> } }>(
  "/api/tools/execute",
  async (request, reply) => {
    const { tool, parameters } = request.body;
    if (!tool || typeof tool !== "string") {
      reply.code(400);
      return { error: "Tool name is required" };
    }
    try {
      return await toolRegistry.execute(tool, parameters || {});
    } catch (error) {
      app.log.error({ error, tool }, "Tool execution error");
      reply.code(500);
      return { error: "Tool execution failed. Check server logs for details." };
    }
  }
);

// Memory search — keep, it's useful and cheap
app.post<{ Body: { query: string; limit?: number } }>("/api/memory/search", async (request) => {
  const { query, limit } = request.body;
  const results = unifiedMemory.search(query || "", limit || 10);
  return { count: results.length, results };
});

app.get("/api/memory/stats", async () => unifiedMemory.getStats());

// ─── TTS ────────────────────────────────────────────────────────

app.post<{ Body: { text: string } }>(
  "/api/tts",
  { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const { text } = request.body;
    if (!text || typeof text !== "string") {
      reply.code(400);
      return { error: "Text is required" };
    }
    if (text.length > 5000) {
      reply.code(400);
      return { error: "Text too long. Maximum 5000 characters." };
    }
    if (!isTTSAvailable()) {
      reply.code(503);
      return { error: "TTS unavailable", fallback: true };
    }
    try {
      const audio = await textToSpeech(text);
      if (!audio) {
        reply.code(503);
        return { error: "TTS generation failed", fallback: true };
      }
      reply.header("Content-Type", "audio/mpeg");
      reply.header("Content-Length", audio.length);
      return reply.send(audio);
    } catch (err) {
      app.log.error({ err }, "TTS endpoint error");
      reply.code(500);
      return { error: "TTS generation failed", fallback: true };
    }
  }
);

app.get("/api/tts/status", async () => ({
  available: isTTSAvailable(),
  provider: "elevenlabs",
  voice: config.elevenlabs.voiceId,
}));

// ─── Housekeeping ───────────────────────────────────────────────

setInterval(() => cleanupOldConversations(24 * 60 * 60 * 1000), 60 * 60 * 1000);

const start = async () => {
  try {
    const bindHost = process.env.FRIDAY_BIND_HOST || "127.0.0.1";
    const address = await app.listen({ port: config.port, host: bindHost });
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  FRIDAY (simple edition) — ${address.padEnd(34)}║
║  Auth: Bearer FRIDAY_API_KEY                                    ║
║  Tools: ${String(toolRegistry.getToolCount()).padEnd(3)} registered                                          ║
║                                                                 ║
║  POST /api/chat             stream chat (SSE)                   ║
║  POST /api/conversations    new conversation                    ║
║  POST /api/stop             cancel active task                  ║
║  POST /api/tools/execute    direct tool call                    ║
║  GET  /api/tools            list tools                          ║
║  POST /api/memory/search    search unified memory               ║
║  GET  /api/memory/stats     memory stats                        ║
║  POST /api/tts              ElevenLabs TTS                      ║
║  GET  /api/health           health check                        ║
╚════════════════════════════════════════════════════════════════╝
`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

start();
