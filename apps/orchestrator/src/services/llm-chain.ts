// Default brain: OpenAI, then xAI only when the primary call cannot be served.
// A 400 is a bad request. It stays on the provider that rejected it.
// Gemini and Claude stay available when FRIDAY_LLM_PROVIDER names them.
// They are not in the default chain.

import OpenAI from "openai";
import { resolveModelRoles } from "./model-roles.js";

export interface LlmEndpoint {
  id: "openai" | "xai" | "gemini" | "anthropic" | "groq";
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

const OPTIONAL: Record<string, Omit<LlmEndpoint, "apiKey" | "model" | "baseURL"> & {
  baseURL: string;
  apiKeyEnv: string;
  defaultModel: string;
}> = {
  gemini: {
    id: "gemini",
    label: "Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1/",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5-20251001",
  },
};

export function xaiBaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1";
  return raw.replace(/\/chat\/completions\/?$/, "");
}

export function resolveLlmChain(env: NodeJS.ProcessEnv = process.env): {
  primary: LlmEndpoint;
  fallback: LlmEndpoint | null;
} {
  const hint = (env.FRIDAY_LLM_PROVIDER || "").trim().toLowerCase();
  const optional = hint && hint !== "openai" ? OPTIONAL[hint] : undefined;
  if (optional) {
    return {
      primary: {
        id: optional.id,
        label: optional.label,
        baseURL: env.FRIDAY_LLM_BASE_URL || optional.baseURL,
        apiKey: env.FRIDAY_LLM_API_KEY || env[optional.apiKeyEnv] || "",
        model: env.FRIDAY_LLM_MODEL || optional.defaultModel,
      },
      fallback: null,
    };
  }

  const primary: LlmEndpoint = {
    id: "openai",
    label: "OpenAI",
    baseURL: env.FRIDAY_LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: env.FRIDAY_LLM_API_KEY || env.OPENAI_API_KEY || "",
    model: resolveModelRoles(env).chat,
  };
  const failoverOff = (env.FRIDAY_LLM_FAILOVER || "").trim().toLowerCase() === "off";
  const fallback: LlmEndpoint | null = failoverOff
    ? null
    : {
        id: "xai",
        label: "xAI",
        baseURL: xaiBaseUrl(env),
        apiKey: env.XAI_API_KEY || "",
        model: resolveModelRoles(env).fallback,
      };
  return { primary, fallback };
}

export function activeEndpoint(chain: {
  primary: LlmEndpoint;
  fallback: LlmEndpoint | null;
}): { endpoint: LlmEndpoint; failedOver: boolean } | null {
  if (chain.primary.apiKey) return { endpoint: chain.primary, failedOver: false };
  if (chain.fallback?.apiKey) return { endpoint: chain.fallback, failedOver: true };
  return null;
}

export function shouldFailover(status: number | undefined, message: string): boolean {
  const text = message || "";
  if (status === 400 || status === 422) return false;
  if (/\binvalid_request\b|\bbad request\b|\b400\b/i.test(text)) return false;
  if (status === 401 || status === 403 || status === 408 || status === 429) return true;
  if (status !== undefined && status >= 500) return true;
  return /insufficient_quota|billing|quota|rate.?limit|overloaded|timeout|econn|fetch failed|network|enotfound/i.test(text);
}

export function endpointClient(endpoint: LlmEndpoint): OpenAI {
  return new OpenAI({
    apiKey: endpoint.apiKey,
    baseURL: endpoint.baseURL,
    timeout: 90_000,
    maxRetries: 0,
  });
}

export function describeChain(env: NodeJS.ProcessEnv = process.env): {
  provider: string;
  model: string;
  hasKey: boolean;
  failover: string | null;
  failoverReady: boolean;
} {
  const chain = resolveLlmChain(env);
  const active = activeEndpoint(chain);
  return {
    provider: active?.endpoint.label || chain.primary.label,
    model: active?.endpoint.model || chain.primary.model,
    hasKey: Boolean(active),
    failover: chain.fallback?.label || null,
    failoverReady: Boolean(chain.fallback?.apiKey),
  };
}
