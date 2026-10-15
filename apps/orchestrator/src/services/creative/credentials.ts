// Credential checks for the creative adapters. No network, no throw.

import { existsSync } from "fs";

export const DEFAULT_BLENDER_PATH = "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe";

export interface IntegrationStatus {
  id: string;
  name: string;
  state: "ready" | "needs_key" | "offline";
  detail: string;
}

export function meshyKey(env: NodeJS.ProcessEnv): string | null {
  const key = env.MESHY_API_KEY?.trim();
  return key || null;
}

export function higgsfieldCredentials(env: NodeJS.ProcessEnv): { id: string; secret: string } | null {
  const id = env.HF_API_KEY_ID?.trim();
  const secret = env.HF_API_KEY_SECRET?.trim();
  if (id && secret) return { id, secret };
  const combined = env.HIGGSFIELD_API_KEY?.trim();
  if (!combined || !combined.includes(":")) return null;
  const split = combined.indexOf(":");
  const left = combined.slice(0, split).trim();
  const right = combined.slice(split + 1).trim();
  if (!left || !right) return null;
  return { id: left, secret: right };
}

export function blenderPath(env: NodeJS.ProcessEnv): string {
  return env.BLENDER_PATH?.trim() || DEFAULT_BLENDER_PATH;
}

export function integrationStatuses(env: NodeJS.ProcessEnv, blenderInstalled = existsSync(blenderPath(env))): IntegrationStatus[] {
  const meshy = meshyKey(env);
  const higgs = higgsfieldCredentials(env);
  const xai = env.XAI_API_KEY?.trim();
  const grok = env.GROK_BOTS?.trim();
  const blender = blenderPath(env);
  return [
    meshy
      ? { id: "meshy", name: "Meshy", state: "ready", detail: "MESHY_API_KEY is set" }
      : { id: "meshy", name: "Meshy", state: "needs_key", detail: "needs key — set MESHY_API_KEY" },
    higgs
      ? { id: "higgsfield", name: "Higgsfield", state: "ready", detail: "HF_API_KEY_ID and HF_API_KEY_SECRET are set" }
      : { id: "higgsfield", name: "Higgsfield", state: "needs_key", detail: "needs key — set HF_API_KEY_ID and HF_API_KEY_SECRET" },
    xai
      ? { id: "xai", name: "xAI Grok", state: "ready", detail: "XAI_API_KEY is set" }
      : { id: "xai", name: "xAI Grok", state: "needs_key", detail: "needs key — set XAI_API_KEY" },
    grok
      ? { id: "grok-bots", name: "Grok bots", state: "ready", detail: "GROK_BOTS is set" }
      : { id: "grok-bots", name: "Grok bots", state: "needs_key", detail: "needs GROK_BOTS — Name|http://status|http://dispatch" },
    blenderInstalled
      ? { id: "blender", name: "Blender", state: "ready", detail: blender }
      : { id: "blender", name: "Blender", state: "offline", detail: `Blender not found at ${blender}` },
  ];
}
