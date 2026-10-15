import { existsSync, readdirSync } from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import { buildSetupChecks } from "../services/setup-status.js";
import { getObsidianVaultPath } from "../services/vault-config.js";

function vaultFound(): boolean {
  const root = getObsidianVaultPath();
  if (!root || !existsSync(root)) return false;
  try {
    return readdirSync(root).some((name) => name.endsWith(".md") || name === "FRIDAY_BRAIN");
  } catch {
    return false;
  }
}

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/setup", async () => {
    const checks = buildSetupChecks({
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY?.trim()),
      hasXai: Boolean(process.env.XAI_API_KEY?.trim()),
      vaultFound: vaultFound(),
      hasElevenKey: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
      hasElevenAgent: Boolean(
        (process.env.ELEVENLABS_AGENT_ID || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "").trim()
      ),
    });
    return {
      ready: checks.filter((check) => !check.optional).every((check) => check.ok),
      checks,
    };
  });
}
