// Phone and VAPI routes are exempt from FRIDAY_API_KEY because VAPI cannot send it.
// They still execute tools, so they require their own shared secret.
// ngrok delivers those calls from 127.0.0.1, so a localhost check is not a secret.

import { createHash, timingSafeEqual } from "crypto";

export function webhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VAPI_WEBHOOK_SECRET || env.RECEPTIONIST_WEBHOOK_SECRET || "").trim();
}

export function webhookAuthorized(
  headers: Record<string, unknown> | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const expected = webhookSecret(env);
  if (!expected) return false;
  const provided = presentedSecret(headers);
  if (!provided) return false;
  return safeEqual(provided, expected);
}

function presentedSecret(headers: Record<string, unknown> | undefined): string {
  if (!headers) return "";
  const direct = headerValue(headers["x-vapi-secret"]) || headerValue(headers["x-friday-webhook-secret"]);
  if (direct) return direct;
  const auth = headerValue(headers.authorization);
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function headerValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
