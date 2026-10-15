// Same-origin proxy for the agent panel. The browser never sees FRIDAY_API_KEY.
// Status is a localhost GET on the orchestrator; dispatch is an authenticated POST.

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/agents`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json().catch(() => ({ agents: [] }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json(
      { agents: [], error: "Orchestrator unreachable on :3001" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const key = process.env.FRIDAY_API_KEY || "";
  if (!key) {
    return Response.json(
      {
        ok: false,
        state: "offline",
        summary: "Set FRIDAY_API_KEY in apps/web/.env.local to the same value the orchestrator printed at boot.",
      },
      { status: 401 }
    );
  }
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/agents/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await res.json().catch(() => ({ ok: false, summary: "bad response" }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { ok: false, state: "offline", summary: "Orchestrator unreachable on :3001" },
      { status: 502 }
    );
  }
}
