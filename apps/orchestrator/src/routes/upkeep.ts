import type { FastifyInstance } from "fastify";
import { approveRepair, getUpkeepSnapshot, rejectRepair } from "../services/upkeep/runtime.js";

export async function upkeepRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/upkeep", async () => getUpkeepSnapshot());

  app.post<{ Params: { id: string } }>("/api/upkeep/repairs/:id/approve", async (request) => {
    return { repair: await approveRepair(request.params.id) };
  });

  app.post<{ Params: { id: string } }>("/api/upkeep/repairs/:id/reject", async (request) => {
    return { repair: rejectRepair(request.params.id) };
  });
}
