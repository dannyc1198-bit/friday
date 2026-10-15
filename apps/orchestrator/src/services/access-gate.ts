// Exact Origin and Host checks, plus short-lived scoped tokens.
// Loopback reachability is not authority: a page on another origin can open
// a websocket to 127.0.0.1, and a proxy must not treat that as the HUD.

import { createHmac, timingSafeEqual } from "crypto";

export type TokenScope = "voice" | "hud";

const DEFAULT_WEB_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function allowedWebOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.FRIDAY_ALLOWED_ORIGINS?.trim();
  if (!raw) return [...DEFAULT_WEB_ORIGINS];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

export function originAllowed(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return false;
  return allowedWebOrigins(env).includes(origin);
}

export function webHostAllowed(host: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!host) return false;
  return allowedWebOrigins(env).some((origin) => {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  });
}

export function orchestratorHostAllowed(host: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!host) return false;
  const port = env.PORT || "3001";
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  const bind = env.FRIDAY_BIND_HOST || "";
  if (bind && bind !== "0.0.0.0" && bind !== "::") allowed.add(`${bind}:${port}`);
  return allowed.has(host);
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueScopedToken(input: {
  scope: TokenScope;
  secret: string;
  now: number;
  ttlMs?: number;
}): string {
  const exp = input.now + (input.ttlMs ?? 5 * 60_000);
  const payload = Buffer.from(JSON.stringify({ scope: input.scope, exp }), "utf8").toString("base64url");
  return `${payload}.${sign(input.secret, payload)}`;
}

export function verifyScopedToken(
  token: string,
  scope: TokenScope,
  secret: string,
  now: number
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "FRIDAY_API_KEY is not set." };
  const [payload, mac] = (token || "").split(".");
  if (!payload || !mac) return { ok: false, reason: "Voice token is missing." };
  const expected = sign(secret, payload);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "Voice token is not valid." };
  }
  let body: { scope?: string; exp?: number };
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { scope?: string; exp?: number };
  } catch {
    return { ok: false, reason: "Voice token is not valid." };
  }
  if (body.scope !== scope) return { ok: false, reason: "Voice token has the wrong scope." };
  if (typeof body.exp !== "number" || body.exp <= now) return { ok: false, reason: "Voice token has expired." };
  return { ok: true };
}

export function voiceUpgradeDecision(input: {
  origin?: string;
  host?: string;
  token?: string;
  secret: string;
  now: number;
  env?: NodeJS.ProcessEnv;
}): { ok: boolean; reason: string } {
  const env = input.env ?? process.env;
  if (!originAllowed(input.origin, env)) return { ok: false, reason: "Origin is not allowed." };
  if (!orchestratorHostAllowed(input.host, env)) return { ok: false, reason: "Host is not allowed." };
  const token = verifyScopedToken(input.token || "", "voice", input.secret, input.now);
  if (!token.ok) return token;
  return { ok: true, reason: "ok" };
}
