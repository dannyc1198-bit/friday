import type { FastifyInstance } from "fastify";
import { integrationStatuses } from "../services/creative/credentials.js";

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/integrations", async () => ({ integrations: integrationStatuses(process.env) }));
}
