const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/neural/graph`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ nodes: [], edges: [] }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ nodes: [], edges: [], error: "Friday's orchestrator did not answer." }, { status: 502 });
  }
}