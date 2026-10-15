// Saves the brain provider. The file is data/settings.json, never .env.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { isBrainProvider, readBrainProvider, writeBrainProvider } from "../services/brain-settings.js";
import { resolveLlmChain } from "../services/llm-chain.js";

const setBrainProviderTool: Tool = {
  name: "set_brain_provider",
  description:
    "Switch Friday's brain and save the choice. provider is openai, xai, or gemini. " +
    "The saved choice overrides environment variables and is tried first. " +
    "Providers with no key or an exhausted quota are skipped. This does not edit .env and does not spend money.",
  category: "settings",
  parameters: [
    {
      name: "provider",
      type: "string",
      description: "openai, xai, or gemini.",
      required: true,
      enum: ["openai", "xai", "gemini"],
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const provider = String(params.provider ?? "").trim().toLowerCase();
    if (!isBrainProvider(provider)) {
      return { toolCallId: "", success: false, error: "provider must be openai, xai, or gemini." };
    }
    writeBrainProvider(provider);
    const chain = resolveLlmChain(process.env);
    const active = chain.endpoints[0];
    return {
      toolCallId: "",
      success: true,
      data: {
        message: active
          ? `Saved ${provider}. The next reply tries ${active.label} first.`
          : `Saved ${provider}. No key is set for openai, xai, or gemini yet.`,
        provider: readBrainProvider(),
        active: active?.id || null,
      },
    };
  },
};

export function registerBrainProviderTools(): void {
  toolRegistry.register(setBrainProviderTool);
}
