// Specialist and classifier calls. Gemini free tier uses flash, then flash-lite.
// The classifier and a team fan-out start on flash-lite so they do not spend the chat minute.

import { endpointClient, resolveLlmChain, type LlmEndpoint } from "../llm-chain.js";
import { callWithRecovery, geminiLiteModel, isProviderExhausted } from "../llm-quota.js";
import { resolveModelRoles } from "../model-roles.js";

export interface MindspaceToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface MindspaceTurn {
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

function endpointsFor(tier: "lite" | "chain"): LlmEndpoint[] {
  const live = resolveLlmChain(process.env).endpoints.filter((endpoint) => !isProviderExhausted(endpoint.id));
  if (tier === "lite") {
    const gemini = live.find((endpoint) => endpoint.id === "gemini");
    if (gemini) return [{ ...gemini, model: geminiLiteModel() }];
    const head = live[0];
    if (!head) return [];
    if (head.id === "openai") return [{ ...head, model: resolveModelRoles().reflect }];
    return [head];
  }
  return live.map((endpoint) => endpoint.id === "gemini"
    ? { ...endpoint, model: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim() }
    : endpoint);
}

export async function mindspaceComplete(input: {
  system: string;
  user: string;
  tools: MindspaceToolSchema[];
  tier: "lite" | "chain";
  signal?: AbortSignal;
}): Promise<MindspaceTurn> {
  const endpoints = endpointsFor(input.tier);
  if (!endpoints.length) throw new Error("No LLM API key configured");
  const result = await callWithRecovery({
    endpoints,
    signal: input.signal,
    liteModel: geminiLiteModel(),
    call: (endpoint) => endpointClient(endpoint).chat.completions.create({
      model: endpoint.model,
      max_tokens: input.tier === "lite" ? 500 : 800,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      ...(input.tools.length > 0 ? { tools: input.tools, tool_choice: "auto" as const } : {}),
    }, { signal: input.signal }),
  });
  if (!result.ok) throw new Error(result.aborted ? "aborted" : result.message);
  const message = result.value.choices[0]?.message;
  const toolCalls = (message?.tool_calls || []).map((call, index) => {
    const fn = (call as { id?: string; function?: { name?: string; arguments?: string } }).function;
    return {
      id: (call as { id?: string }).id || `mind_${index}`,
      name: fn?.name || "",
      arguments: fn?.arguments || "{}",
    };
  });
  return { text: message?.content || "", toolCalls };
}
