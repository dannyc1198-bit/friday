import type { FastifyInstance } from "fastify";
import { mindspaceSnapshot } from "../services/mindspace/activity.js";

export async function mindspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/mindspace", async () => mindspaceSnapshot());
}
