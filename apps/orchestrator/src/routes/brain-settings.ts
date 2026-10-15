import type { FastifyInstance } from "fastify";
import { isBrainProvider, readBrainProvider, writeBrainProvider, type BrainProviderId } from "../services/brain-settings.js";
import { resolveLlmChain } from "../services/llm-chain.js";

const CHOICES: Array<{ id: BrainProviderId; label: string; env: string }> = [
  { id: "openai", label: "OpenAI", env: "OPENAI_API_KEY" },
  { id: "xai", label: "xAI", env: "XAI_API_KEY" },
  { id: "gemini", label: "Gemini", env: "GEMINI_API_KEY" },
];

function snapshot() {
  const chain = resolveLlmChain(process.env);
  const saved = readBrainProvider();
  return {
    provider: saved,
    active: chain.endpoints[0]?.id || null,
    activeLabel: chain.endpoints[0]?.label || null,
    order: chain.endpoints.map((endpoint) => endpoint.id),
    options: CHOICES.map((choice) => ({
      ...choice,
      ready: chain.endpoints.some((endpoint) => endpoint.id === choice.id),
      selected: saved === choice.id,
    })),
  };
}

export async function brainSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings/brain", async () => snapshot());

  app.post<{ Body: { provider?: string } }>("/api/settings/brain", async (request, reply) => {
    const provider = String(request.body?.provider || "").trim().toLowerCase();
    if (!isBrainProvider(provider)) {
      reply.code(400);
      return { error: "provider must be openai, xai, or gemini." };
    }
    writeBrainProvider(provider);
    const next = snapshot();
    return {
      ...next,
      detail: next.active
        ? `Saved. ${next.activeLabel} is first.`
        : `Saved ${provider}. That provider has no key yet.`,
    };
  });
}
