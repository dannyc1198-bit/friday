// OpenClaw Bridge — Proxies tool calls to ClawBridge (Danny's OpenClaw replacement)
// ClawBridge runs at localhost:18789 with the same API shape as OpenClaw.
// Start it with: cd ~/clawbridge && python main.py

import { readFileSync } from "fs";
import { join } from "path";

const OPENCLAW_BASE = process.env.OPENCLAW_BASE_URL || "http://localhost:18789";
const OPENCLAW_TIMEOUT_MS = 30_000;

// Read token from ~/.openclaw/openclaw.json (ClawBridge writes it there automatically)
function getOpenClawToken(): string {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    return process.env.OPENCLAW_GATEWAY_TOKEN;
  }

  try {
    const configPath = join(
      process.env.USERPROFILE || process.env.HOME || "",
      ".openclaw",
      "openclaw.json"
    );
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return config?.gateway?.auth?.token || "";
  } catch {
    return "";
  }
}

let cachedToken: string | null = null;

function getToken(): string {
  if (!cachedToken) {
    cachedToken = getOpenClawToken();
  }
  return cachedToken;
}

// ─── Health check ─────────────────────────────────────────────────────────────

let lastHealthCheck = 0;
let isHealthy = false;
const HEALTH_CHECK_INTERVAL_MS = 60_000;

export async function isOpenClawAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return isHealthy;
  }

  const token = getToken();
  if (!token) {
    isHealthy = false;
    lastHealthCheck = now;
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OPENCLAW_BASE}/api/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    isHealthy = response.ok;
  } catch {
    isHealthy = false;
  }

  lastHealthCheck = now;
  return isHealthy;
}

// ─── Generic tool call proxy ──────────────────────────────────────────────────

export async function callOpenClaw(
  tool: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const token = getToken();

  if (!token) {
    throw new Error(
      "ClawBridge token not found. Start ClawBridge: cd ~/clawbridge && python main.py"
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENCLAW_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENCLAW_BASE}/api/tools/invoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tool, params }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `ClawBridge returned ${response.status}: ${text.slice(0, 200)}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `ClawBridge request timed out after ${OPENCLAW_TIMEOUT_MS / 1000}s`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Reset health cache ───────────────────────────────────────────────────────

export function resetOpenClawHealth(): void {
  lastHealthCheck = 0;
  cachedToken = null;
  isHealthy = false;
}
