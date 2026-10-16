import { test } from "node:test";
import assert from "node:assert/strict";
import { isCreditError, openAIHasCredit, resetCreditProbe } from "./openai-credit.js";
import { resetExhaustedProviders } from "./llm-quota.js";

function fake(status: number, body: string, counter: { n: number }): typeof fetch {
  return (async () => {
    counter.n += 1;
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

test("credit_balance_exhausted means no realtime, and the probe is cached", async () => {
  resetCreditProbe();
  resetExhaustedProviders();
  const counter = { n: 0 };
  const body = JSON.stringify({ error: { code: "credit_balance_exhausted" } });
  assert.equal(await openAIHasCredit({ apiKey: "k", now: 1, fetchImpl: fake(429, body, counter) }), false);
  assert.equal(await openAIHasCredit({ apiKey: "k", now: 2, fetchImpl: fake(200, "{}", counter) }), false);
  assert.equal(counter.n, 1);
});

test("insufficient_quota is a credit error; a funded key passes", async () => {
  resetCreditProbe();
  resetExhaustedProviders();
  assert.equal(isCreditError('{"error":{"code":"insufficient_quota"}}'), true);
  const counter = { n: 0 };
  assert.equal(await openAIHasCredit({ apiKey: "k", now: 1, fetchImpl: fake(200, "{}", counter) }), true);
  assert.equal(await openAIHasCredit({ apiKey: "", now: 1 }), false);
});
