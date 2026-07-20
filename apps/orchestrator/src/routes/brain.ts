// Brain API — feeds the FRIDAY window's Brain panel with REAL data
// (replacing the old HUD panels that silently rendered mock numbers).

import type { FastifyInstance } from "fastify";
import { searchBrain, getBrainStats, getRecentLearnings, rescanVault } from "../services/brain.js";
import { runReflection, loadReflectionState } from "../services/reflection.js";

export async function brainRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", async () => {
    const stats = getBrainStats();
    const reflection = loadReflectionState();
    return {
      ...stats,
      reflection: {
        lastDate: reflection.lastReflectionDate,
        lastRunAt: reflection.lastRunAt,
        lastSummary: reflection.lastSummary,
        lastFactsAdded: reflection.lastFactsAdded,
        lastError: reflection.lastError,
      },
    };
  });

  app.get<{ Querystring: { limit?: string } }>("/recent", async (request) => {
    const limit = parseInt(request.query.limit || "20", 10) || 20;
    return { learnings: getRecentLearnings(limit) };
  });

  app.post<{ Body: { query: string; limit?: number } }>("/search", async (request, reply) => {
    const { query, limit } = request.body || ({} as { query: string });
    if (!query || typeof query !== "string") {
      reply.code(400);
      return { error: "query is required" };
    }
    const results = searchBrain(query, limit || 8);
    return { count: results.length, results };
  });

  // Manual reflection trigger — one LLM call; rate-limited hard.
  app.post(
    "/reflect",
    { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } },
    async () => runReflection()
  );

  // Force re-index (vault edited outside the 5-min window)
  app.post("/reindex", async () => {
    const result = await rescanVault();
    return { ...result, ...getBrainStats() };
  });
}
