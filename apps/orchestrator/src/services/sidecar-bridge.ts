// Sidecar Bridge — Proxies requests to the Python sidecar (camera, voice, kitchen)
// Falls back gracefully when sidecar is offline

const SIDECAR_BASE = process.env.SIDECAR_URL || "http://localhost:3002";
const SIDECAR_TIMEOUT_MS = 10_000;

let lastHealthCheck = 0;
let isHealthy = false;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

export async function isSidecarAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return isHealthy;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${SIDECAR_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    isHealthy = resp.ok;
  } catch {
    isHealthy = false;
  }
  lastHealthCheck = now;
  return isHealthy;
}

export async function callSidecar(
  endpoint: string,
  options?: { method?: string; body?: unknown }
): Promise<unknown> {
  const method = options?.method || "GET";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIDECAR_TIMEOUT_MS);

  try {
    const resp = await fetch(`${SIDECAR_BASE}${endpoint}`, {
      method,
      signal: controller.signal,
      ...(options?.body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          }
        : {}),
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Sidecar ${resp.status}: ${text.slice(0, 200)}`);
    }

    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("image/")) {
      return Buffer.from(await resp.arrayBuffer());
    }
    return await resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error(`Sidecar request to ${endpoint} timed out after ${SIDECAR_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

export async function getSidecarStatus(): Promise<Record<string, unknown> | null> {
  try {
    if (!(await isSidecarAvailable())) return null;
    return (await callSidecar("/api/status")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getSidecarFrame(): Promise<Buffer | null> {
  try {
    if (!(await isSidecarAvailable())) return null;
    return (await callSidecar("/api/frame")) as Buffer;
  } catch {
    return null;
  }
}

export async function getSidecarEvents(): Promise<unknown[]> {
  try {
    if (!(await isSidecarAvailable())) return [];
    const data = (await callSidecar("/api/events")) as { events: unknown[] };
    return data.events || [];
  } catch {
    return [];
  }
}

export async function triggerSidecarSpeak(text: string): Promise<boolean> {
  try {
    if (!(await isSidecarAvailable())) return false;
    await callSidecar("/api/speak", { method: "POST", body: { text } });
    return true;
  } catch {
    return false;
  }
}

export async function triggerSidecarNotify(
  title: string,
  message: string,
  level: string = "info"
): Promise<boolean> {
  try {
    if (!(await isSidecarAvailable())) return false;
    await callSidecar("/api/notify", { method: "POST", body: { title, message, level } });
    return true;
  } catch {
    return false;
  }
}
