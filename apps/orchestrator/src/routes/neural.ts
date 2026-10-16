import type { FastifyInstance } from "fastify";
import { recentThoughts, subscribeThoughts } from "../services/thought-bus.js";
import { thinkingStatus, updateThinkingEnabled } from "../services/thinking-loop.js";
import { buildVaultGraph, readVaultNote } from "../services/vault-graph.js";
import { config } from "../config/index.js";

export async function neuralRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/neural/thoughts", async () => ({ thoughts: recentThoughts(40) }));

  app.get("/api/neural/thinking", async () => thinkingStatus());

  app.get("/api/neural/graph", async (_request, reply) => {
    const root = config.obsidianVaultPath;
    if (!root) {
      reply.code(503);
      return { error: "OBSIDIAN_VAULT_PATH is not set." };
    }
    return buildVaultGraph(root);
  });

  app.get<{ Querystring: { path?: string } }>("/api/neural/note", async (request, reply) => {
    const note = readVaultNote(config.obsidianVaultPath, String(request.query.path || ""));
    if (!note) {
      reply.code(404);
      return { error: "That note is not in the vault." };
    }
    return note;
  });

  app.post<{ Body: { enabled?: boolean } }>("/api/neural/thinking", async (request, reply) => {
    if (typeof request.body?.enabled !== "boolean") {
      reply.code(400);
      return { error: "enabled must be true or false." };
    }
    return updateThinkingEnabled(request.body.enabled);
  });

  app.get("/api/neural/stream", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (event: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    for (const event of recentThoughts(40)) send(event);
    const unsubscribe = subscribeThoughts(send);
    const ping = setInterval(() => {
      reply.raw.write(": ping\n\n");
    }, 15_000);
    request.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
}
