// Model ids checked against vendor docs on 2026-10-15.
// OpenAI: developers.openai.com/api/docs/models and /api/docs/pricing
// xAI: docs.x.ai/developers/models and /developers/pricing (updated 2026-10-10)
// gpt-6-astra is not an OpenAI model id. The flagship chat id is gpt-5.4.

export const MODEL_ROLES = {
  chat: "gpt-5.4",
  reflect: "gpt-5.4-mini",
  embed: "text-embedding-3-small",
  realtime: "gpt-realtime-2.1",
  fallback: "grok-4.7",
} as const;

export interface ModelRoles {
  chat: string;
  reflect: string;
  embed: string;
  realtime: string;
  fallback: string;
}

export function resolveModelRoles(env: NodeJS.ProcessEnv = process.env): ModelRoles {
  const chat = (env.OPENAI_MODEL || env.FRIDAY_LLM_MODEL || MODEL_ROLES.chat).trim();
  return {
    chat,
    reflect: (env.FRIDAY_REFLECT_MODEL || MODEL_ROLES.reflect).trim(),
    embed: (env.EMBEDDING_MODEL || MODEL_ROLES.embed).trim(),
    realtime: (env.FRIDAY_REALTIME_MODEL || MODEL_ROLES.realtime).trim(),
    fallback: (env.XAI_MODEL || MODEL_ROLES.fallback).trim(),
  };
}
