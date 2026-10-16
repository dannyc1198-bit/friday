// Quota and per-minute limits.
// Credit exhaustion (OpenAI insufficient_quota) is remembered for a few minutes.
// A Gemini 429 is a per-minute limit: wait once, then try flash-lite on the same key.

import { shouldFailover, type LlmEndpoint } from "./llm-chain.js";

export const EXHAUSTED_TTL_MS = 5 * 60_000;
export const SHORT_BACKOFF_MS = 1_500;
export const MAX_BACKOFF_MS = 8_000;
export const GEMINI_LITE_MODEL = "gemini-2.5-flash-lite";

export interface TriedProvider {
  label: string;
  reason: string;
}

export interface RecoverySuccess<T> {
  ok: true;
  value: T;
  endpoint: LlmEndpoint;
  index: number;
  tried: TriedProvider[];
}

export interface RecoveryFailure {
  ok: false;
  tried: TriedProvider[];
  status?: number;
  message: string;
  aborted?: boolean;
}

const exhaustedUntil = new Map<string, number>();

export function resetExhaustedProviders(): void {
  exhaustedUntil.clear();
}

export function markProviderExhausted(id: string, now = Date.now(), ttlMs = EXHAUSTED_TTL_MS): void {
  exhaustedUntil.set(id, now + ttlMs);
}

export function isProviderExhausted(id: string, now = Date.now()): boolean {
  return (exhaustedUntil.get(id) || 0) > now;
}

export function isCreditExhausted(status: number | undefined, message: string): boolean {
  // OpenAI credit codes only. Gemini's per-minute text also says "billing details".
  return /insufficient_quota|credit_balance_exhausted|billing_hard_limit/i.test(message || "")
    && status !== 400
    && status !== 422;
}

export function isRetryableRateLimit(status: number | undefined, message: string): boolean {
  if (isCreditExhausted(status, message)) return false;
  if (status === 429) return true;
  return /rate.?limit|resource exhausted|too many requests/i.test(message || "");
}

export function geminiLiteModel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.GEMINI_LITE_MODEL || GEMINI_LITE_MODEL).trim() || GEMINI_LITE_MODEL;
}

export function isGeminiLite(model: string): boolean {
  return /flash-lite/i.test(model);
}

/** First 429 retries the same model. The next one moves to flash-lite. Lite does not loop. */
export function nextGeminiAttempt(model: string, retried: boolean, liteModel = GEMINI_LITE_MODEL):
  | { kind: "retry" }
  | { kind: "lite"; model: string }
  | { kind: "stop" } {
  if (!retried) return { kind: "retry" };
  if (!isGeminiLite(model) && liteModel && liteModel !== model) return { kind: "lite", model: liteModel };
  return { kind: "stop" };
}

export function retryAfterMs(input: { header?: string | null; message?: string; now?: number }): number {
  const header = (input.header || "").trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return clampWait(seconds * 1000);
    const dated = Date.parse(header);
    if (Number.isFinite(dated)) return clampWait(dated - (input.now ?? Date.now()));
  }
  const match = /retry(?:\s+in|\s*delay)?[^0-9]{0,24}(\d+(?:\.\d+)?)\s*s/i.exec(input.message || "");
  if (match) return clampWait(Number(match[1]) * 1000);
  return SHORT_BACKOFF_MS;
}

function clampWait(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return SHORT_BACKOFF_MS;
  return Math.min(Math.max(ms, 250), MAX_BACKOFF_MS);
}

export function errorFacts(err: unknown): { status?: number; message: string; retryAfter: string | null } {
  const value = err as {
    status?: number;
    message?: string;
    code?: string;
    error?: { code?: string; type?: string; message?: string };
    headers?: { get?: (name: string) => string | null } & Record<string, string | undefined>;
    response?: { status?: number; headers?: { get?: (name: string) => string | null } & Record<string, string | undefined> };
  };
  const status = value?.status ?? value?.response?.status;
  const message = [value?.message, value?.code, value?.error?.code, value?.error?.type, value?.error?.message]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ");
  const headers = value?.headers || value?.response?.headers;
  let retryAfter: string | null = null;
  if (headers) {
    if (typeof headers.get === "function") retryAfter = headers.get("retry-after");
    else retryAfter = headers["retry-after"] || headers["Retry-After"] || null;
  }
  return { status, message, retryAfter };
}

function aborted(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const name = (err as { name?: string })?.name;
  return name === "AbortError" || name === "APIUserAbortError";
}

export async function callWithRecovery<T>(input: {
  endpoints: LlmEndpoint[];
  startIndex?: number;
  call: (endpoint: LlmEndpoint) => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  liteModel?: string;
}): Promise<RecoverySuccess<T> | RecoveryFailure> {
  const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? Date.now;
  const liteModel = input.liteModel ?? geminiLiteModel();
  const tried: TriedProvider[] = [];
  let index = input.startIndex ?? 0;
  let geminiRetried = false;
  let current: LlmEndpoint | null = null;

  while (index < input.endpoints.length) {
    if (input.signal?.aborted) return { ok: false, tried, message: "aborted", aborted: true };
    const base = input.endpoints[index];
    if (!current || current.id !== base.id) current = { ...base };
    if (isProviderExhausted(current.id, now())) {
      tried.push({ label: current.label, reason: "quota exhausted (cached)" });
      index += 1;
      current = null;
      geminiRetried = false;
      continue;
    }
    try {
      const value = await input.call(current);
      return { ok: true, value, endpoint: current, index, tried };
    } catch (err) {
      if (aborted(err, input.signal)) return { ok: false, tried, message: "aborted", aborted: true };
      const facts = errorFacts(err);
      if (isCreditExhausted(facts.status, facts.message)) {
        markProviderExhausted(current.id, now());
        tried.push({ label: current.label, reason: "quota exhausted" });
        index += 1;
        current = null;
        geminiRetried = false;
        continue;
      }
      if (current.id === "gemini" && /gemini/i.test(current.model) && isRetryableRateLimit(facts.status, facts.message)) {
        const plan = nextGeminiAttempt(current.model, geminiRetried, liteModel);
        if (plan.kind === "retry") {
          geminiRetried = true;
          const wait = retryAfterMs({ header: facts.retryAfter, message: facts.message, now: now() });
          console.warn(`[FRIDAY LLM] Gemini 429 on ${current.model}. Retrying in ${wait}ms.`);
          await sleep(wait);
          continue;
        }
        if (plan.kind === "lite") {
          tried.push({ label: current.label, reason: "rate limited" });
          current = { ...current, model: plan.model, label: "Gemini lite" };
          geminiRetried = true;
          console.warn(`[FRIDAY LLM] Gemini still limited. Using ${plan.model}.`);
          continue;
        }
      }
      tried.push({ label: current.label, reason: facts.status === 429 ? "rate limited" : (facts.message || "unavailable").slice(0, 80) });
      const status = facts.status;
      // A 400/422, or any other non-failover error, stays on the provider that rejected it.
      const stick = !shouldFailover(status, facts.message);
      if (stick || index + 1 >= input.endpoints.length) {
        return { ok: false, tried, status, message: facts.message };
      }
      index += 1;
      current = null;
      geminiRetried = false;
    }
  }
  return { ok: false, tried, message: "no provider available" };
}
