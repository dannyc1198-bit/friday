import test from "node:test";
import assert from "node:assert/strict";
import type { LlmEndpoint } from "./llm-chain.js";
import {
  EXHAUSTED_TTL_MS,
  callWithRecovery,
  isProviderExhausted,
  nextGeminiAttempt,
  resetExhaustedProviders,
  retryAfterMs,
} from "./llm-quota.js";

const openai: LlmEndpoint = {
  id: "openai",
  label: "OpenAI",
  baseURL: "https://api.openai.com/v1",
  apiKey: "sk",
  model: "gpt-5.4",
};
const gemini: LlmEndpoint = {
  id: "gemini",
  label: "Gemini",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: "gem",
  model: "gemini-2.5-flash",
};

function rateLimit(header?: string): Error {
  const err = new Error("429 RESOURCE_EXHAUSTED Please retry in 2s");
  (err as Error & { status: number; headers: Record<string, string> }).status = 429;
  if (header) (err as Error & { headers: Record<string, string> }).headers = { "retry-after": header };
  return err;
}

test("retry-after wins and a missing hint is a short backoff", () => {
  assert.equal(retryAfterMs({ header: "2" }), 2000);
  assert.equal(retryAfterMs({ message: "Please retry in 3.5s" }), 3500);
  assert.equal(retryAfterMs({ header: "40" }), 8000);
  assert.equal(retryAfterMs({}), 1500);
  assert.equal(nextGeminiAttempt("gemini-2.5-flash", false).kind, "retry");
  assert.deepEqual(nextGeminiAttempt("gemini-2.5-flash", true), { kind: "lite", model: "gemini-2.5-flash-lite" });
  assert.equal(nextGeminiAttempt("gemini-2.5-flash-lite", true).kind, "stop");
});

test("a gemini 429 retries once, then uses flash-lite on the same key", async () => {
  resetExhaustedProviders();
  const calls: string[] = [];
  const sleeps: number[] = [];
  const result = await callWithRecovery({
    endpoints: [gemini],
    sleep: async (ms) => { sleeps.push(ms); },
    call: async (endpoint) => {
      calls.push(endpoint.model);
      if (endpoint.model === "gemini-2.5-flash") throw rateLimit("2");
      return "spoken";
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, "spoken");
  assert.deepEqual(calls, ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  assert.deepEqual(sleeps, [2000]);
  assert.equal(isProviderExhausted("gemini"), false);
});

test("a gemini per-minute error that mentions billing still reaches flash-lite", async () => {
  resetExhaustedProviders();
  const calls: string[] = [];
  const result = await callWithRecovery({
    endpoints: [gemini],
    sleep: async () => undefined,
    call: async (endpoint) => {
      calls.push(endpoint.model);
      if (endpoint.model === "gemini-2.5-flash") {
        const err = new Error("429 You exceeded your current quota, please check your plan and billing details. Please retry in 2s");
        (err as Error & { status: number }).status = 429;
        throw err;
      }
      return "lite";
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  assert.equal(isProviderExhausted("gemini"), false);
  resetExhaustedProviders();
});

test("openai credit exhaustion is remembered and skipped on the next turn", async () => {
  resetExhaustedProviders();
  const seen: string[] = [];
  const first = await callWithRecovery({
    endpoints: [openai, gemini],
    sleep: async () => { throw new Error("credit exhaustion must not wait"); },
    call: async (endpoint) => {
      seen.push(endpoint.id);
      if (endpoint.id === "openai") {
        const err = new Error("429 insufficient_quota credit_balance_exhausted");
        (err as Error & { status: number }).status = 429;
        throw err;
      }
      return "ok";
    },
  });
  assert.equal(first.ok, true);
  assert.equal(isProviderExhausted("openai"), true);

  const later: string[] = [];
  const second = await callWithRecovery({
    endpoints: [openai, gemini],
    now: () => Date.now(),
    sleep: async () => undefined,
    call: async (endpoint) => {
      later.push(endpoint.id);
      return "ok";
    },
  });
  assert.equal(second.ok, true);
  assert.deepEqual(later, ["gemini"]);
  assert.equal(isProviderExhausted("openai", Date.now() + EXHAUSTED_TTL_MS + 1), false);
  resetExhaustedProviders();
});
