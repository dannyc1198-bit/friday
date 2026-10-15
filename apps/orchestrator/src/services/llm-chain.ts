// Brain order: openai, then xAI, then Gemini.
// A saved provider is tried first and overrides FRIDAY_LLM_PROVIDER.
// A missing key or an exhausted quota is skipped. A 400 stays on that provider.

import OpenAI from "openai";
import { readBrainProvider, type BrainProviderId } from "./brain-settings.js";
import { resolveModelRoles } from "./model-roles.js";

export interface LlmEndpoint {
  id: BrainProviderId | "anthropic" | "groq";
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface LlmChain {
  endpoints: LlmEndpoint[];
  preferred: BrainProviderId | null;
  missing: Array<{ id: BrainProviderId; env: string }>;
}

export interface ChainOptions {
  /** Explicit pin. Null means the default order and skips the settings file. */
  preferred?: BrainProviderId | null;
  /** Null skips disk. Undefined reads data/settings.json. */
  settingsFile?: string | null;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GEMINI_MODEL = "gemini-2.5-flash";

const OPTIONAL: Record<string, { id: "anthropic" | "groq"; label: string; baseURL: string; apiKeyEnv: string; defaultModel: string }> = {
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

const KEY_ENV: Record<BrainProviderId, string> = {
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export function xaiBaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1";
  return raw.replace(/\/chat\/completions\/?$/, "");
}

function savedOrEnvPreference(env: NodeJS.ProcessEnv, options?: ChainOptions): BrainProviderId | null {
  if (options && Object.prototype.hasOwnProperty.call(options, "preferred")) {
    return options.preferred ?? null;
  }
  if (options?.settingsFile !== null) {
    const saved = readBrainProvider(options?.settingsFile);
    if (saved) return saved;
  }
  const hint = (env.FRIDAY_LLM_PROVIDER || "").trim().toLowerCase();
  if (hint === "openai" || hint === "xai" || hint === "gemini") return hint;
  return null;
}

function ordered(preferred: BrainProviderId | null): BrainProviderId[] {
  const rest: BrainProviderId[] = ["openai", "xai", "gemini"];
  if (!preferred) return rest;
  return [preferred, ...rest.filter((id) => id !== preferred)];
}

function buildProvider(id: BrainProviderId, env: NodeJS.ProcessEnv): LlmEndpoint {
  const roles = resolveModelRoles(env);
  if (id === "xai") {
    return {
      id,
      label: "xAI",
      baseURL: xaiBaseUrl(env),
      apiKey: env.XAI_API_KEY || "",
      model: roles.fallback,
    };
  }
  if (id === "gemini") {
    return {
      id,
      label: "Gemini",
      baseURL: env.GEMINI_BASE_URL || GEMINI_BASE,
      apiKey: env.GEMINI_API_KEY || "",
      model: (env.GEMINI_MODEL || GEMINI_MODEL).trim(),
    };
  }
  return {
    id,
    label: "OpenAI",
    baseURL: env.FRIDAY_LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: env.OPENAI_API_KEY || env.FRIDAY_LLM_API_KEY || "",
    model: roles.chat,
  };
}

export function resolveLlmChain(env: NodeJS.ProcessEnv = process.env, options?: ChainOptions): LlmChain {
  const hint = (env.FRIDAY_LLM_PROVIDER || "").trim().toLowerCase();
  const preferred = savedOrEnvPreference(env, options);
  if (!preferred && OPTIONAL[hint]) {
    const spec = OPTIONAL[hint];
    const endpoint: LlmEndpoint = {
      id: spec.id,
      label: spec.label,
      baseURL: env.FRIDAY_LLM_BASE_URL || spec.baseURL,
      apiKey: env.FRIDAY_LLM_API_KEY || env[spec.apiKeyEnv] || "",
      model: env.FRIDAY_LLM_MODEL || spec.defaultModel,
    };
    return {
      endpoints: endpoint.apiKey ? [endpoint] : [],
      preferred: null,
      missing: [],
    };
  }

  const built = ordered(preferred).map((id) => buildProvider(id, env));
  return {
    endpoints: built.filter((endpoint) => endpoint.apiKey),
    preferred,
    missing: built.filter((endpoint) => !endpoint.apiKey).map((endpoint) => ({
      id: endpoint.id as BrainProviderId,
      env: KEY_ENV[endpoint.id as BrainProviderId],
    })),
  };
}

export function activeEndpoint(chain: LlmChain): { endpoint: LlmEndpoint; failedOver: boolean } | null {
  const endpoint = chain.endpoints[0];
  if (!endpoint) return null;
  return { endpoint, failedOver: endpoint.id !== "openai" };
}

export function shouldFailover(status: number | undefined, message: string): boolean {
  const text = message || "";
  if (status === 400 || status === 422) return false;
  if (/\binvalid_request\b|\bbad request\b|\b400\b/i.test(text)) return false;
  if (status === 401 || status === 403 || status === 408 || status === 429) return true;
  if (status !== undefined && status >= 500) return true;
  return /insufficient_quota|credit_balance_exhausted|billing|quota|rate.?limit|overloaded|timeout|econn|fetch failed|network|enotfound/i.test(text);
}

export function failoverReason(status: number | undefined, message: string): string {
  const text = message || "";
  if (/insufficient_quota|credit_balance_exhausted|billing|quota/i.test(text)) return "quota exhausted";
  if (status === 429 || /rate.?limit/i.test(text)) return "rate limited";
  if (status === 401 || status === 403) return "key rejected";
  return status ? `unavailable (${status})` : "unavailable";
}

export function exhaustedBrainMessage(
  tried: Array<{ label: string; reason: string }>,
  missingEnvs: string[]
): string {
  const body = tried.map((item) => `${item.label}: ${item.reason}`).join("; ");
  const missing = missingEnvs.length ? ` No key for ${missingEnvs.join(", ")}.` : "";
  return `I could not finish that. ${body}.${missing}`.replace(/\s+/g, " ").trim();
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
  const active = chain.endpoints[0];
  const rest = chain.endpoints.slice(1).map((endpoint) => endpoint.label);
  return {
    provider: active?.label || "none",
    model: active?.model || "",
    hasKey: Boolean(active),
    failover: rest.join(", ") || null,
    failoverReady: rest.length > 0,
  };
}
