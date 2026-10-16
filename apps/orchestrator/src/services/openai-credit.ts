// Does OpenAI have credit for live voice?
// A realtime client secret is issued even at $0, then the call dies.
// One tiny probe, cached, tells the Talk tab to use the free path instead:
// browser listening, the Gemini brain, ElevenLabs TTS, then the Edge voice.

import { isProviderExhausted, markProviderExhausted } from "./llm-quota.js";

export const CREDIT_PROBE_TTL_MS = 30 * 60_000;
const CREDIT_CODES = /insufficient_quota|credit_balance_exhausted|billing_hard_limit|billing_not_active/i;

let cached: { ok: boolean; at: number } | null = null;

export function resetCreditProbe(): void {
  cached = null;
}

export function isCreditError(text: string): boolean {
  return CREDIT_CODES.test(text || "");
}

export function markOpenAICreditExhausted(now = Date.now()): void {
  cached = { ok: false, at: now };
  markProviderExhausted("openai", now, CREDIT_PROBE_TTL_MS);
}

export async function openAIHasCredit(input: {
  apiKey: string;
  now?: number;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const now = input.now ?? Date.now();
  if (!input.apiKey) return false;
  if (isProviderExhausted("openai", now)) return false;
  if (cached && now - cached.at < CREDIT_PROBE_TTL_MS) return cached.ok;
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      cached = { ok: true, at: now };
      return true;
    }
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403 || isCreditError(text) || res.status === 429) {
      markOpenAICreditExhausted(now);
      return false;
    }
    cached = { ok: true, at: now };
    return true;
  } catch {
    // Network trouble: do not trust realtime for a while.
    cached = { ok: false, at: now };
    return false;
  }
}
