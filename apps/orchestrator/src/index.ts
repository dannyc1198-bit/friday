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
  ensureConversation,
  addUserMessage,
  addAssistantMessage,
  getMessages,
  cleanupOldConversations,
} from "./services/conversation.js";
import { streamChatCompletion } from "./services/openai.js";
import { memoryService } from "./services/memory/index.js";
import { textToSpeech, isTTSAvailable } from "./services/tts.js";
import { getActiveVoice } from "./services/voice-registry.js";
import { resolveSpeechPlan } from "./services/speech-plan.js";
import { agentRoutes } from "./routes/agents.js";
import { mediaRoutes } from "./routes/media.js";
import { greetingRoutes } from "./routes/greeting.js";
import { todayRoutes } from "./routes/today.js";
import { integrationRoutes } from "./routes/integrations.js";
import { upkeepRoutes } from "./routes/upkeep.js";
import { liveVoiceRoutes } from "./routes/live-voice.js";
import { neuralRoutes } from "./routes/neural.js";
import { setupRoutes } from "./routes/setup.js";
import { brainSettingsRoutes } from "./routes/brain-settings.js";
import { mindspaceRoutes } from "./routes/mindspace.js";
import { answerMindspace } from "./services/mindspace/run.js";
import { elevenVoiceId, specialistById } from "./services/mindspace/specialists.js";
import { recordIncident } from "./services/upkeep/runtime.js";
import { isMisfire } from "./services/upkeep/guards.js";
import { getBootId } from "./services/greeting.js";
import { writeLearningsFromTurn } from "./services/learning-writeback.js";
import {
  initializeMCPClients,
  shutdownMCPClients,
  getMCPStatus,
} from "./services/mcp-client.js";
// Un-amputation 2026-05-04: re-imported frozen services. Market monitor
// stays imported but unstarted — Danny will configure its target later
// from inside FRIDAY herself.
import { learningEngine } from "./services/learning-engine.js";
import { proactiveMonitor } from "./services/proactive-monitor.js";
import { marketMonitor } from "./services/market-monitor.js";
import { permissionManager } from "./services/permission-manager.js";
import { startAlertDelivery, stopAlertDelivery } from "./services/alert-delivery.js";
import { getMorningBriefing } from "./services/morning-briefing.js";
import { fridayPhoneRoutes } from "./routes/friday-phone.js";
import { openaiCompatRoutes } from "./routes/openai-compat.js";
import { voiceRoutes } from "./routes/voice.js";
import { vapiLlmRoutes } from "./routes/vapi-llm.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { brainRoutes } from "./routes/brain.js";
import { skillRoutes } from "./routes/skills.js";
import proactiveAlertsRoutes from "./routes/proactive-alerts.js";
import { initBrain, stopBrain, formatBrainContext, recallHits } from "./services/brain.js";
import { loadCoreProfile, profileMentioned } from "./services/profile.js";
import { publishThought } from "./services/thought-bus.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";
import { getLLMInfo } from "./services/openai.js";
import { authMiddleware, initAuth } from "./middleware/auth.js";
import { stopTargets } from "./services/run-control.js";
import { grantEffect, takeStagedEffect } from "./services/effect-gate.js";
import { unifiedMemory } from "./services/unified-memory.js";
import {
  buildFullMemoryContext,
  saveConversationSummary,
} from "./services/memory-loader.js";
import { promises as fs } from "fs";
import path from "path";
import { CONVERSATION_DIR, ensureRuntimeDirs, localTimestamp } from "./services/runtime-paths.js";
import { conversationTranscriptPath } from "./services/safe-path.js";
import {
  buildProceduralSkillContextWithUsage,
  captureCorrectionProposal,
  recordProceduralSkillOutcome,
  type ProceduralOutcome,
} from "./services/procedural-skills.js";

function toolThoughtDetail(parameters: Record<string, unknown> | undefined): string {
  if (!parameters) return "ran";
  for (const key of ["query", "entity", "observation", "title"]) {
    const value = parameters[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 160);
  }
  return "ran";
}

// ─── Conversation transcript persistence ────────────────────────
// Every chat turn gets appended to a JSONL file under data/conversations/{id}.jsonl
// so Danny can scroll back through any past conversation forever, independent of
// the in-memory conversations Map (which doesn't survive restarts).
const CONVO_DIR = CONVERSATION_DIR;

// Per-conversation write mutex: appends for the same conversation chain onto
// the previous append's promise so concurrent turns can't interleave partial
// JSONL lines. Entry is deleted once its chain drains, so the Map stays small.
const transcriptChains = new Map<string, Promise<void>>();

function appendTranscript(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  meta?: { toolCalls?: string[]; toolResultsCount?: number }
): Promise<void> {
  if (!content || !content.trim()) return Promise.resolve();
  const prev = transcriptChains.get(conversationId) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      await fs.mkdir(CONVO_DIR, { recursive: true });
      const file = conversationTranscriptPath(CONVO_DIR, conversationId);
      if (!file) return;
      const line = JSON.stringify({
        role,
        content,
        timestamp: localTimestamp(),
        timestampUtc: new Date().toISOString(),
        ...(meta || {}),
      }) + "\n";
      await fs.appendFile(file, line, "utf-8");
    } catch (err) {
      console.warn("[Transcript] append failed:", (err as Error).message);
    }
  });
  transcriptChains.set(conversationId, next);
  next.then(() => {
    // Only delete if no newer append has been chained on since.
    if (transcriptChains.get(conversationId) === next) {
      transcriptChains.delete(conversationId);
    }
  });
  return next;
}

async function listTranscripts(): Promise<Array<{ id: string; turns: number; firstAt: string; lastAt: string; firstUser: string }>> {
  try {
    await fs.mkdir(CONVO_DIR, { recursive: true });
    const files = await fs.readdir(CONVO_DIR);
    const out: Array<{ id: string; turns: number; firstAt: string; lastAt: string; firstUser: string }> = [];
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const id = f.slice(0, -".jsonl".length);
      const raw = await fs.readFile(path.join(CONVO_DIR, f), "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      if (lines.length === 0) continue;
      try {
        const first = JSON.parse(lines[0]);
        const last = JSON.parse(lines[lines.length - 1]);
        const firstUserLine = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((m) => m && m.role === "user");
        out.push({
          id,
          turns: lines.length,
          firstAt: first.timestamp || "",
          lastAt: last.timestamp || "",
          firstUser: firstUserLine?.content?.slice(0, 80) || "(no user turn)",
        });
      } catch { /* skip malformed file */ }
    }
    return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  } catch {
    return [];
  }
}

async function readTranscript(conversationId: string): Promise<Array<{ role: string; content: string; timestamp: string }>> {
  try {
    const file = conversationTranscriptPath(CONVO_DIR, conversationId);
    if (!file) return [];
    const raw = await fs.readFile(file, "utf-8");
    return raw.split("\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean) as Array<{ role: string; content: string; timestamp: string }>;
  } catch {
    return [];
  }
}

const MAX_MESSAGE_LENGTH = 4000;

function storedParameters(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Tool arguments are canonicalized before they are logged. A bad line must not drop the reply.
  }
  return {};
}
const activeAbortControllers = new Map<string, AbortController>();
const lastProceduralSkillsByConversation = new Map<string, string[]>();

const app = Fastify({
  logger: {
    level: "info",
    transport: { target: "pino-pretty", options: { colorize: true } },
  },
});

ensureRuntimeDirs();

await app.register(cors, {
  origin: [config.corsOrigin, "http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:8080"],
  credentials: true,
});
await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
await app.register(websocket);

initAuth();
app.addHook("onRequest", authMiddleware);

await app.register(fridayPhoneRoutes, { prefix: "/api/friday-phone" });
await app.register(openaiCompatRoutes);
await app.register(voiceRoutes);
await app.register(vapiLlmRoutes, { prefix: "/vapi/llm" });
await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
await app.register(brainRoutes, { prefix: "/api/brain" });
await app.register(skillRoutes, { prefix: "/api/skills" });
await app.register(agentRoutes);
await app.register(mediaRoutes);
await app.register(greetingRoutes);
await app.register(todayRoutes);
await app.register(integrationRoutes);
await app.register(upkeepRoutes);
await app.register(liveVoiceRoutes);
await app.register(neuralRoutes);
await app.register(setupRoutes);
await app.register(brainSettingsRoutes);
await app.register(mindspaceRoutes);
await app.register(proactiveAlertsRoutes);

initializeTools();

// Obsidian brain: index the vault (sub-second at current size), then keep a
// 5-min incremental rescan running. Non-fatal if the vault is missing.
initBrain().catch((err) => console.warn("  ⚠ Brain index failed:", (err as Error).message));

// Time-based jobs: briefing and reflection wait 2 minutes after boot, then one at a time.
startScheduler();

await initializeMCPClients();

// Heartbeat: proactive monitor wakes every 5 min and queues alerts;
// alert-delivery polls that queue every 15s and speaks high-priority
// items via TTS. Quiet hours (11 PM–5 AM) gate everything.
proactiveMonitor.start();
startAlertDelivery();

// Touch the singletons so module side-effects fire (load persisted state).
void learningEngine;
void permissionManager;
void marketMonitor;

memoryService.initialize().then((connected) => {
  const report = memoryService.getMemoryReport();
  console.log(connected ? `  ✓ Chat memory: ${report.detail}` : `  ⚠ Chat memory unavailable. ${report.detail}`);
});

// OpenClaw sync is opt-in (OPENCLAW_SYNC=true). Default = local-only memory.
if (process.env.OPENCLAW_SYNC === "true") {
  try {
    const syncResult = unifiedMemory.syncWithOpenClaw();
    console.log(`  ✓ Unified Memory: ${syncResult.imported} imported, ${syncResult.exported} exported`);
  } catch {
    console.log("  ⚠ Unified Memory: local-only mode");
  }
} else {
  console.log("  ✓ Unified Memory: local-only (OPENCLAW_SYNC not enabled)");
}

// ─── Core endpoints ─────────────────────────────────────────────

app.get("/api/health", async () => {
  const llm = getLLMInfo();
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    service: "FRIDAY-orchestrator",
    version: "2.2.0-brain",
    bootId: getBootId(),
    llm: {
      provider: llm.provider,
      model: llm.model,
      configured: llm.hasKey,
      failover: llm.failover,
      failoverReady: llm.failoverReady,
    },
    tools: toolRegistry.getToolCount(),
    tts: isTTSAvailable(),
  };
});

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

app.get("/api/mcp/status", async () => getMCPStatus());

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

    if (isMisfire(message)) {
      recordIncident({
        kind: "misfire",
        signature: "user-misfire",
        summary: "Danny reported a misfire",
        detail: message.slice(0, 240),
      });
    }

    const priorTurns = conversationId ? await readTranscript(conversationId) : [];
    const conversation = ensureConversation(conversationId, priorTurns);
    addUserMessage(conversation.id, message);

    // A direct correction is first-class learning evidence. Attach it to the
    // prior outcome before generating the next answer so Friday can adapt now.
    let capturedSkillProposal: string | null = null;
    const isCorrection = learningEngine.isExplicitFeedback(message);
    const isPositiveFeedback = /\b(that (?:was|is) (?:perfect|great|good|exactly right)|exactly what i wanted|that worked|nice work)\b/i.test(message);
    const priorProceduralSkills = lastProceduralSkillsByConversation.get(conversation.id) || [];
    const isNegativeFeedback = /\b(that(?:'s| is) wrong|not what i asked|you misunderstood|don't do that|stop doing)\b/i.test(message);
    if (priorProceduralSkills.length && (isNegativeFeedback || isPositiveFeedback)) {
      recordProceduralSkillOutcome(priorProceduralSkills, isNegativeFeedback ? "failure" : "success");
    }
    if (isCorrection || isPositiveFeedback) {
      learningEngine.processFeedback(message, learningEngine.getMostRecentOutcomeId());
    }
    if (isCorrection) {
      try {
        const proposal = captureCorrectionProposal(message);
        if (proposal?.status === "pending") capturedSkillProposal = proposal.id;
      } catch (err) {
        app.log.warn({ err }, "skill correction capture failed");
      }
    }

    const allowedOrigins = [config.corsOrigin, "http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:8080"];
    const requestOrigin = request.headers.origin || "";
    const sseOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : config.corsOrigin;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": sseOrigin,
      // Echo the conversation id so the client can persist it and pass it back
      // on the next turn. Exposed via CORS so the browser fetch can read it.
      "X-Conversation-Id": conversation.id,
      "Access-Control-Expose-Headers": "X-Conversation-Id",
    });

    // Append every user turn to the on-disk transcript for this conversation.
    // Fire-and-forget — never blocks the chat path.
    appendTranscript(conversation.id, "user", message).catch(() => {});

    const messages = getMessages(conversation.id);

    // Memory context injection: standing memory + cross-agent memory + the
    // brain's per-message vault recall (local BM25 — free, instant, relevant).
    const proceduralUsage = buildProceduralSkillContextWithUsage(message);
    lastProceduralSkillsByConversation.set(conversation.id, proceduralUsage.skills);
    if (lastProceduralSkillsByConversation.size > 1000) {
      const oldest = lastProceduralSkillsByConversation.keys().next().value;
      if (oldest) lastProceduralSkillsByConversation.delete(oldest);
    }
    const recalled = recallHits(message, 5);
    for (const hit of recalled) {
      publishThought({ kind: "recall", label: hit.noteName, detail: hit.notePath, source: "vault" });
    }
    const profile = loadCoreProfile();
    if (profile.found && profileMentioned(message, profile.text)) {
      publishThought({
        kind: "recall",
        label: "DANNY-PROFILE",
        detail: profile.relativePath,
        source: "pinned",
      });
    }

    const memoryContext =
      "\n\nCHANNEL: text HUD. Structured answers, lists, and markdown links are appropriate. Cite vault notes as [[path]].\n\n" +
      buildFullMemoryContext() +
      "\n" + unifiedMemory.buildContextForPrompt(message) +
      learningEngine.buildLearningContext() +
      proceduralUsage.context +
      (capturedSkillProposal
        ? `\n\nLEARNING NOTICE: A procedural preference proposal (${capturedSkillProposal}) was drafted from Danny's correction. It is not active until he approves it. Briefly mention that it is ready for review.`
        : "") +
      formatBrainContext(recalled);

    const abortController = new AbortController();
    activeAbortControllers.set(conversation.id, abortController);
    let settled = false;
    const onClose = () => {
      if (!settled) abortController.abort();
    };
    reply.raw.on("close", onClose);

    let fullContent = "";
    const toolCalls: { name: string; arguments: string }[] = [];
    const toolResults: { toolCallId: string; success: boolean; data?: unknown; error?: string }[] = [];

    try {
      const minded = await answerMindspace(message, { signal: abortController.signal });
      if (minded) {
        fullContent = minded.text;
        if (minded.voice) {
          reply.raw.write(`data: ${JSON.stringify({
            type: "voice",
            specialist: minded.voice.specialist,
            edge: minded.voice.edge,
          })}\n\n`);
        }
        reply.raw.write(`data: ${JSON.stringify({ type: "text", content: minded.text })}\n\n`);
      } else {
      for await (const chunk of streamChatCompletion(messages, abortController.signal, memoryContext)) {
        if (chunk.type === "text" && chunk.content) {
          fullContent += chunk.content;
          reply.raw.write(`data: ${JSON.stringify({ type: "text", content: chunk.content })}\n\n`);
        } else if (chunk.type === "tool_call" && chunk.toolCall) {
          toolCalls.push({
            name: chunk.toolCall.toolName,
            arguments: JSON.stringify(chunk.toolCall.parameters),
          });
          publishThought({
            kind: "tool",
            label: chunk.toolCall.toolName,
            detail: toolThoughtDetail(chunk.toolCall.parameters),
            source: "chat",
          });
          reply.raw.write(
            `data: ${JSON.stringify({
              type: "tool_call",
              tool: chunk.toolCall.toolName,
              parameters: chunk.toolCall.parameters,
              error: undefined,
            })}\n\n`
          );
        } else if (chunk.type === "tool_result" && chunk.toolResult) {
          const toolName = toolCalls[toolCalls.length - 1]?.name || "unnamed";
          toolResults.push({
            toolCallId: chunk.toolResult.toolCallId,
            success: chunk.toolResult.success,
            data: chunk.toolResult.data,
            error: chunk.toolResult.error,
          });
          if (!chunk.toolResult.success) {
            recordIncident({
              kind: "tool",
              signature: `tool:${toolName}`,
              summary: `${toolName} failed`,
              detail: chunk.toolResult.error || "tool failed",
            });
          }
          reply.raw.write(
            `data: ${JSON.stringify({
              type: "tool_result",
              tool: toolName,
              result: chunk.toolResult.data,
              success: chunk.toolResult.success,
              error: chunk.toolResult.error,
            })}\n\n`
          );
        } else if (chunk.type === "error") {
          recordIncident({
            kind: "runtime",
            signature: "llm-error",
            summary: "Model stream error",
            detail: chunk.content || "stream error",
          });
          reply.raw.write(`data: ${JSON.stringify({ type: "error", content: chunk.content })}\n\n`);
        }
      }
      }

      addAssistantMessage(
        conversation.id,
        fullContent,
        toolCalls.length > 0
          ? toolCalls.map((tc, i) => ({
              id: `call-${i}`,
              toolName: tc.name,
              parameters: storedParameters(tc.arguments),
            }))
          : undefined,
        toolResults.length > 0 ? toolResults : undefined
      );

      // Append assistant turn (with any tool activity) to on-disk transcript.
      appendTranscript(conversation.id, "assistant", fullContent, {
        toolCalls: toolCalls.map((t) => t.name),
        toolResultsCount: toolResults.length,
      }).catch(() => {});

      // Lightweight memory save — fire and forget
      const summary = `User: ${message.slice(0, 100)} → FRIDAY: ${fullContent.slice(0, 100)}`;
      const keyFacts = toolCalls.length > 0 ? [`Used tools: ${toolCalls.map((t) => t.name).join(", ")}`] : [];
      saveConversationSummary(summary, keyFacts).catch(() => {});

      // Learning engine: record the turn so tool success rates and behavior
      // patterns accumulate (it persists itself on every record).
      try {
        const failures = toolResults.filter((r) => !r.success).length;
        const turnOutcome: ProceduralOutcome =
          toolResults.length === 0 ? "unknown"
          : failures === 0 ? "success"
          : failures === toolResults.length ? "failure"
          : "partial";
        learningEngine.recordOutcome({
          action: `Chat: ${message.slice(0, 60)}`,
          context: message.slice(0, 200),
          toolsUsed: toolCalls.map((t) => t.name),
          outcome: turnOutcome,
        });
        recordProceduralSkillOutcome(proceduralUsage.skills, turnOutcome);
      } catch (err) {
        app.log.warn({ err }, "learning-engine record failed");
      }

      writeLearningsFromTurn(message).catch((err) => {
        app.log.warn({ err }, "brain write-back failed");
      });

      reply.raw.write(`data: ${JSON.stringify({ type: "done", conversationId: conversation.id })}\n\n`);
    } catch (error) {
      app.log.error({ error }, "Chat error");
      recordIncident({
        kind: "runtime",
        signature: "chat-exception",
        summary: "Chat request failed",
        detail: (error as Error).message || "chat exception",
      });
      reply.raw.write(`data: ${JSON.stringify({ type: "error", content: "Something went wrong. Please try again." })}\n\n`);
    } finally {
      settled = true;
      reply.raw.removeListener("close", onClose);
      activeAbortControllers.delete(conversation.id);
      reply.raw.end();
    }
  }
);

// List all on-disk conversation transcripts (newest first)
app.get("/api/conversations", async () => {
  const transcripts = await listTranscripts();
  return { conversations: transcripts };
});

// Read a single conversation transcript
app.get<{ Params: { id: string } }>("/api/conversations/:id", async (request, reply) => {
  const turns = await readTranscript(request.params.id);
  if (turns.length === 0) {
    reply.code(404);
    return { error: "Conversation not found" };
  }
  return { id: request.params.id, turns };
});

app.post<{ Body: { conversationId?: string } }>("/api/stop", async (request) => {
  const decision = stopTargets(request.body?.conversationId, [...activeAbortControllers.keys()]);
  if (decision.error) {
    return {
      stopped: false,
      error: decision.error,
      note: "Nothing else was cancelled. A tool that already started may still finish and is reported as uninterruptible.",
    };
  }
  for (const id of decision.ids) {
    activeAbortControllers.get(id)?.abort();
    activeAbortControllers.delete(id);
  }
  return {
    stopped: true,
    conversationId: decision.ids[0],
    note: "The model stream was cancelled. A tool that already started may finish; that result is marked uninterruptible.",
  };
});

app.post<{ Params: { token: string } }>("/api/effects/:token/approve", async (request, reply) => {
  const staged = takeStagedEffect(request.params.token);
  if (!staged) {
    reply.code(404);
    return { ok: false, error: "That approval expired or does not match a pending browser submission." };
  }
  grantEffect(staged.binding);
  const result = await toolRegistry.execute(staged.tool, staged.parameters);
  return { ok: result.success, binding: staged.binding, result };
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

app.post<{ Body: { text: string; specialist?: string } }>(
  "/api/tts",
  { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const { text } = request.body;
    const speaker = request.body.specialist ? specialistById(request.body.specialist) : null;
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
      const audio = await textToSpeech(text, speaker
        ? { voiceId: elevenVoiceId(speaker), edgeVoice: speaker.voice.edge }
        : {});
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

app.get("/api/tts/status", async () => {
  // Resolved per request from the voice registry — reflects switch_voice live.
  const activeVoice = getActiveVoice();
  const plan = resolveSpeechPlan(process.env, activeVoice.edgeVoice);
  return {
    available: isTTSAvailable(),
    provider: plan.provider,
    fallback: plan.provider === "elevenlabs" && plan.fallbackEdge ? "edge" : "browser",
    voice: plan.provider === "edge" ? plan.edgeVoice : activeVoice.voiceId,
    edgeVoice: plan.edgeVoice,
    elevenLabsConfigured: plan.elevenLabsConfigured,
    persona: activeVoice.persona,
    personaName: activeVoice.displayName,
  };
});

// ─── Housekeeping ───────────────────────────────────────────────

// Guard against overlapping runs if cleanup ever becomes slow/async.
let cleanupRunning = false;
setInterval(() => {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    cleanupOldConversations(24 * 60 * 60 * 1000);
  } finally {
    cleanupRunning = false;
  }
}, 60 * 60 * 1000);

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

async function gracefulShutdown(): Promise<void> {
  stopScheduler();
  stopBrain();
  stopAlertDelivery();
  proactiveMonitor.stop();
  await shutdownMCPClients();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

start();
