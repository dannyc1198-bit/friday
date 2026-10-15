// Authentication Middleware — Bearer token gating for all FRIDAY API endpoints
// Auto-generates a secure API key on first run and stores it in .env
//
// Public endpoints (no auth): GET /api/health
// Protected endpoints (auth required): everything else

import { randomBytes, timingSafeEqual, createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { FastifyRequest, FastifyReply } from "fastify";
import { originAllowed, voiceUpgradeDecision } from "../services/access-gate.js";

// ─── Config ─────────────────────────────────────────────────────
const ENV_PATH = join(
  import.meta.dirname || ".",
  "..",
  "..",
  ".env"
);

// Endpoints that don't require authentication
const PUBLIC_PATHS = new Set([
  "/api/health",
]);

// ─── Key Management ─────────────────────────────────────────────

let apiKey: string | null = null;

function loadOrGenerateApiKey(): string {
  // Check environment first
  if (process.env.FRIDAY_API_KEY) {
    return process.env.FRIDAY_API_KEY;
  }

  // Try to read from .env file
  try {
    if (existsSync(ENV_PATH)) {
      const envContent = readFileSync(ENV_PATH, "utf-8");
      const match = envContent.match(/^FRIDAY_API_KEY=(.+)$/m);
      if (match && match[1].trim()) {
        process.env.FRIDAY_API_KEY = match[1].trim();
        return match[1].trim();
      }
    }
  } catch {
    // Fall through to generation
  }

  // Generate a new secure API key
  const newKey = `friday_${randomBytes(32).toString("hex")}`;

  // Append to .env file
  try {
    let envContent = "";
    if (existsSync(ENV_PATH)) {
      envContent = readFileSync(ENV_PATH, "utf-8");
    }

    if (!envContent.endsWith("\n")) {
      envContent += "\n";
    }

    envContent += `\n# FRIDAY API Authentication Key (auto-generated)\nFRIDAY_API_KEY=${newKey}\n`;
    writeFileSync(ENV_PATH, envContent, "utf-8");
    console.log("[Auth] Generated FRIDAY_API_KEY and saved it to .env.");
    console.log("[Auth] Copy that line into apps/web/.env.local. The key is not printed here.");
  } catch (error) {
    console.warn("[Auth] Could not save API key to .env — using in-memory only");
    console.warn(`[Auth] In-memory API key: ${newKey}`);
  }

  process.env.FRIDAY_API_KEY = newKey;
  return newKey;
}

export function getApiKey(): string {
  if (!apiKey) {
    apiKey = loadOrGenerateApiKey();
  }
  return apiKey;
}

function safeCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ─── Middleware ──────────────────────────────────────────────────

// HUD read-only endpoints — safe to expose to same-origin localhost without auth.
// These are GET-only reads that the dashboard polls every few seconds; requiring
// the bearer on every poll just floods the console with 401s. The orchestrator
// binds to 127.0.0.1 (FRIDAY_BIND_HOST), so an unauthed GET from 127.0.0.1 is
// the user's own browser. Mutating endpoints still require auth.
const LOCALHOST_READ_PREFIXES = [
  "/api/system/",
  "/api/agents/",
  "/api/media",
  "/api/greeting",
  "/api/today",
  "/api/integrations",
  "/api/upkeep",
  "/api/neural",
  "/api/setup",
  "/api/settings",
  "/api/voice/live",
  "/api/voice/elevenlabs",
  "/api/learning/",
  "/api/proactive/",
  "/api/market/",
  "/api/memory/stats",
  "/api/tools",
  "/api/conversations",
  "/api/skills/active",
  "/api/skills/proposals",
  "/api/skills/overview",
];

function isLocalhost(request: FastifyRequest): boolean {
  const ip = request.ip || request.socket?.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function headerValue(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function queryToken(request: FastifyRequest): string {
  const query = request.query as { token?: unknown } | undefined;
  return typeof query?.token === "string" ? query.token : "";
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const path = request.url.split("?")[0]; // Strip query params

  // Allow public endpoints
  if (PUBLIC_PATHS.has(path)) {
    return;
  }

  // Allow Spotify OAuth callbacks (browser redirect flow)
  if (path.startsWith("/api/spotify/callback")) {
    return;
  }

  // Phone routes do not use FRIDAY_API_KEY. The route handlers require
  // VAPI_WEBHOOK_SECRET or RECEPTIONIST_WEBHOOK_SECRET before any tool runs.
  if (path.startsWith("/api/receptionist")) {
    return;
  }
  if (path.startsWith("/api/friday-phone")) {
    return;
  }

  // VAPI custom LLM calls. The route requires the webhook secret.
  if (path.startsWith("/vapi/llm")) {
    return;
  }

  // Voice websocket: a loopback TCP connection is not a session. The browser
  // must present an allowed Origin and Host plus a short-lived voice token.
  if (path === "/v1/voice") {
    const decision = voiceUpgradeDecision({
      origin: headerValue(request, "origin"),
      host: headerValue(request, "host"),
      token: queryToken(request),
      secret: getApiKey(),
      now: Date.now(),
    });
    if (!decision.ok) {
      reply.code(401).send({ error: "Unauthorized", message: decision.reason });
      return;
    }
    return;
  }

  // Credential-minting voice routes always require the bearer key, even from
  // loopback. The HUD proxy attaches that key only after its own session check.
  const voiceCredential =
    path === "/api/voice/elevenlabs/token" ||
    path === "/api/voice/realtime/session" ||
    path === "/api/voice/realtime/tool" ||
    path === "/api/voice/session-token";

  // Allow same-machine HUD reads on whitelisted prefixes.
  // Method must be GET (no mutations); IP must be local loopback.
  // A browser Origin, when present, must be on the allowlist.
  if (
    !voiceCredential &&
    request.method === "GET" &&
    isLocalhost(request) &&
    (path === "/api/agents" || path === "/api/greeting" || LOCALHOST_READ_PREFIXES.some((p) => path.startsWith(p)))
  ) {
    const origin = headerValue(request, "origin");
    if (origin && !originAllowed(origin)) {
      reply.code(403).send({ error: "Forbidden", message: "Origin is not allowed." });
      return;
    }
    return;
  }

  // Extract Bearer token
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header. Use: Bearer <FRIDAY_API_KEY>",
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const validKey = getApiKey();

  if (!safeCompare(token, validKey)) {
    reply.code(403).send({
      error: "Forbidden",
      message: "Invalid API key.",
    });
    return;
  }
}

// ─── Init ───────────────────────────────────────────────────────

export function initAuth(): void {
  const key = getApiKey();
  console.log(`[Auth] API key loaded (${key.slice(0, 12)}...)`);
}
