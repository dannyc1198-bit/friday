// FRIDAY Phone Webhook — VAPI mid-call tool dispatcher
// Routes any VAPI tool call into FRIDAY's tool registry so the phone assistant
// can use the full 120+ tool surface (memory, obsidian, browser, code agent, etc.)

import type { FastifyPluginAsync } from "fastify";
import { toolRegistry } from "../tools/registry.js";

interface VapiToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

interface VapiWebhookBody {
  message?: {
    type?: string;
    toolCallList?: VapiToolCall[];
    toolCalls?: VapiToolCall[];
    functionCall?: {
      name?: string;
      parameters?: Record<string, unknown>;
    };
  };
}

function parseArgs(args: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === "string") {
    try { return JSON.parse(args); } catch { return {}; }
  }
  return args;
}

export const fridayPhoneRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async () => ({
    ok: true,
    service: "FRIDAY Phone Assistant",
    toolCount: toolRegistry.getToolCount(),
  }));

  // VAPI calls this on every tool/function invocation during a phone call.
  // Response shape matches VAPI's expected "results" array for toolCallList,
  // and "result" string for legacy functionCall.
  app.post<{ Body: VapiWebhookBody }>("/webhook", async (request, reply) => {
    const body = request.body;
    app.log.info({ body }, "[friday-phone] VAPI webhook received");

    const toolCalls = body?.message?.toolCallList ?? body?.message?.toolCalls;

    if (toolCalls && toolCalls.length > 0) {
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          const name = tc.function?.name ?? "";
          const args = parseArgs(tc.function?.arguments);
          const result = await toolRegistry.execute(name, args);
          return {
            toolCallId: tc.id ?? "",
            result: result.success
              ? JSON.stringify(result.data ?? "done")
              : `Tool failed: ${result.error}`,
          };
        })
      );
      return { results };
    }

    if (body?.message?.functionCall) {
      const name = body.message.functionCall.name ?? "";
      const params = body.message.functionCall.parameters ?? {};
      const result = await toolRegistry.execute(name, params);
      return {
        result: result.success
          ? JSON.stringify(result.data ?? "done")
          : `Tool failed: ${result.error}`,
      };
    }

    reply.code(200);
    return { result: "no-op" };
  });
};
