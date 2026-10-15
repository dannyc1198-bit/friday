import type { FastifyInstance } from "fastify";
import { agentService } from "../services/agents/registry.js";

const MAX_TASK = 8000;

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/agents", async () => {
    const agents = await agentService.list();
    return { agents };
  });

  app.post<{ Body: { agentId?: string; task?: string; workingDirectory?: string; model?: string } }>(
    "/api/agents/dispatch",
    async (request, reply) => {
      const agentId = String(request.body?.agentId || "").trim();
      const task = String(request.body?.task || "");
      if (!agentId || !task.trim()) {
        reply.code(400);
        return { ok: false, state: "offline", summary: "agentId and task are required" };
      }
      if (task.length > MAX_TASK) {
        reply.code(400);
        return { ok: false, state: "offline", summary: `task exceeds ${MAX_TASK} characters` };
      }
      const workingDirectory = request.body?.workingDirectory?.trim() || undefined;
      const model = request.body?.model?.trim() || undefined;
      return agentService.dispatch(agentId, task, { workingDirectory, model });
    }
  );
}
