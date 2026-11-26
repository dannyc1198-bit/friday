import type { FastifyInstance } from "fastify";
import { getMemoryPort, type MemoryScope } from "../services/memory/port.js";

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/port", async () => {
    const port = getMemoryPort();
    return { sources: port.sources() };
  });

  app.post<{ Body: { query?: string; scopes?: MemoryScope[] | "all"; k?: number } }>("/port/recall", async (request, reply) => {
    const query = request.body?.query?.trim() || "";
    if (query.length < 2) {
      reply.code(400);
      return { error: "query is required" };
    }
    const hits = await getMemoryPort().recall(query, request.body?.scopes || "all", request.body?.k || 5);
    return { count: hits.length, hits };
  });

  app.post<{ Body: { text?: string; title?: string; folder?: "Jarvis" | "Inbox"; kind?: string } }>("/port/remember", async (request, reply) => {
    const text = request.body?.text?.trim() || "";
    if (!text) {
      reply.code(400);
      return { error: "text is required" };
    }
    return getMemoryPort().remember({
      text,
      title: request.body?.title,
      folder: request.body?.folder,
      kind: request.body?.kind,
    });
  });

  app.post<{ Body: { target?: string } }>("/port/forget", async (request, reply) => {
    const target = request.body?.target?.trim() || "";
    if (!target) {
      reply.code(400);
      return { error: "target is required" };
    }
    return getMemoryPort().forget(target);
  });

  app.post("/port/index", async () => getMemoryPort().indexAll());

  app.post("/port/reindex", async (_request, reply) => {
    try {
      return await getMemoryPort().reindex();
    } catch (error) {
      reply.code(503);
      return { error: error instanceof Error ? error.message : "Reindex failed" };
    }
  });
}
