// Authentication Middleware — Bearer token gating for all JARVIS API endpoints
// Auto-generates a secure API key on first run and stores it in .env
//
// Public endpoints (no auth): GET /api/health
// Protected endpoints (auth required): everything else

import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { FastifyRequest, FastifyReply } from "fastify";

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
  if (process.env.JARVIS_API_KEY) {
    return process.env.JARVIS_API_KEY;
  }

  // Try to read from .env file
  try {
    if (existsSync(ENV_PATH)) {
      const envContent = readFileSync(ENV_PATH, "utf-8");
      const match = envContent.match(/^JARVIS_API_KEY=(.+)$/m);
      if (match && match[1].trim()) {
        process.env.JARVIS_API_KEY = match[1].trim();
        return match[1].trim();
      }
    }
  } catch {
    // Fall through to generation
  }

  // Generate a new secure API key
  const newKey = `jarvis_${randomBytes(32).toString("hex")}`;

  // Append to .env file
  try {
    let envContent = "";
    if (existsSync(ENV_PATH)) {
      envContent = readFileSync(ENV_PATH, "utf-8");
    }

    if (!envContent.endsWith("\n")) {
      envContent += "\n";
    }

    envContent += `\n# JARVIS API Authentication Key (auto-generated)\nJARVIS_API_KEY=${newKey}\n`;
    writeFileSync(ENV_PATH, envContent, "utf-8");
    console.log("[Auth] Generated new API key and saved to .env");
    console.log(`[Auth] Your API key: ${newKey}`);
    console.log("[Auth] Use this in requests: Authorization: Bearer <key>");
  } catch (error) {
    console.warn("[Auth] Could not save API key to .env — using in-memory only");
  }

  process.env.JARVIS_API_KEY = newKey;
  return newKey;
}

export function getApiKey(): string {
  if (!apiKey) {
    apiKey = loadOrGenerateApiKey();
  }
  return apiKey;
}

// ─── Middleware ──────────────────────────────────────────────────

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

  // Allow VAPI webhooks (validated by webhook secret separately)
  if (path.startsWith("/api/receptionist")) {
    return;
  }

  // Extract Bearer token
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header. Use: Bearer <JARVIS_API_KEY>",
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const validKey = getApiKey();

  if (token !== validKey) {
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
