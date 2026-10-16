// HUD session cookie. The browser must present an allowed Host, an exact
// Origin, and a short-lived cookie before a route may attach FRIDAY_API_KEY.

const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const TTL_MS = 12 * 60 * 60 * 1000;

export function allowedWebOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.FRIDAY_ALLOWED_ORIGINS?.trim();
  if (!raw) return [...DEFAULT_ORIGINS];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

export function webHostAllowed(host: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!host) return false;
  return allowedWebOrigins(env).some((origin) => {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  });
}

export function originAllowed(origin: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return false;
  return allowedWebOrigins(env).includes(origin);
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signHudSession(secret: string, host: string, now: number): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ host, exp: now + TTL_MS })));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function hudSessionValid(token: string | null, secret: string, host: string, now: number): Promise<boolean> {
  if (!token || !secret) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;
  const expected = await hmac(secret, payload);
  if (!safeEqual(mac, expected)) return false;
  try {
    const body = JSON.parse(b64urlDecode(payload)) as { host?: string; exp?: number };
    return body.host === host && typeof body.exp === "number" && body.exp > now;
  } catch {
    return false;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface HudGateInput {
  method: string;
  host: string | null;
  origin: string | null;
  cookie: string | null;
  demo: string | null;
  secret: string;
  now: number;
  secFetchSite?: string | null;
  env?: NodeJS.ProcessEnv;
}

export interface HudGateDecision {
  ok: boolean;
  status?: number;
  reason?: string;
  setCookie?: string;
}

export async function hudGate(input: HudGateInput): Promise<HudGateDecision> {
  const env = input.env ?? process.env;
  if (!webHostAllowed(input.host, env)) {
    return { ok: false, status: 403, reason: "Host is not allowed." };
  }
  if (input.demo === "1" && MUTATING.has(input.method)) {
    return { ok: false, status: 409, reason: "Demo mode does not send. Nothing left this browser." };
  }
  if (!MUTATING.has(input.method)) {
    if (!input.secret) return { ok: true };
    const valid = await hudSessionValid(input.cookie, input.secret, input.host || "", input.now);
    if (valid) return { ok: true };
    return { ok: true, setCookie: await signHudSession(input.secret, input.host || "", input.now) };
  }
  if (!input.secret) {
    return { ok: false, status: 401, reason: "Set FRIDAY_API_KEY in apps/web/.env.local and reload." };
  }
  if (!originAllowed(input.origin, env)) {
    return { ok: false, status: 403, reason: "Origin is not allowed." };
  }
  try {
    if (new URL(input.origin || "").host !== input.host) {
      return { ok: false, status: 403, reason: "Origin does not match Host." };
    }
  } catch {
    return { ok: false, status: 403, reason: "Origin is not allowed." };
  }
  if (input.secFetchSite && input.secFetchSite !== "same-origin" && input.secFetchSite !== "none") {
    return { ok: false, status: 403, reason: "Cross-site request blocked." };
  }
  const valid = await hudSessionValid(input.cookie, input.secret, input.host || "", input.now);
  if (!valid) return { ok: false, status: 401, reason: "HUD session is missing. Reload the deck." };
  return { ok: true };
}
