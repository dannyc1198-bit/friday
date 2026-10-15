const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/voice/realtime/tool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const data = await res.json().catch(() => ({ output: JSON.stringify({ error: "tool failed" }) }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ output: JSON.stringify({ error: "tool failed" }) }, { status: 502 });
  }
}
