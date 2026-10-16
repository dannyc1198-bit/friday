const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/settings/brain`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ options: [] }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: "Orchestrator unreachable on :3001", options: [] }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const key = process.env.FRIDAY_API_KEY || "";
  if (!key) {
    return Response.json(
      { error: "Set FRIDAY_API_KEY in apps/web/.env.local to the same value the orchestrator printed at boot." },
      { status: 401 }
    );
  }
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/settings/brain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "bad response" }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "Orchestrator unreachable on :3001" }, { status: 502 });
  }
}
