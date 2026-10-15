const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

async function forward(path: string, body?: string) {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || "{}",
  });
  const data = await res.json().catch(() => ({ error: "Voice request failed." }));
  return Response.json(data, { status: res.ok ? 200 : res.status });
}

export async function POST(request: Request) {
  const body = await request.text();
  try {
    return await forward("/api/voice/realtime/session", body);
  } catch {
    return Response.json({ error: "Realtime session unavailable." }, { status: 502 });
  }
}
