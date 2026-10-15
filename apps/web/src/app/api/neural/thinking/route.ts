const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/neural/thinking`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ enabled: false, reason: "Orchestrator offline.", insights: [] }));
    return Response.json(data);
  } catch {
    return Response.json({ enabled: false, reason: "Orchestrator offline.", insights: [] }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const res = await fetch(`${ORCHESTRATOR_URL}/api/neural/thinking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.json().catch(() => ({ enabled: false, reason: "Orchestrator offline." }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ enabled: false, reason: "Orchestrator offline." }, { status: 502 });
  }
}
