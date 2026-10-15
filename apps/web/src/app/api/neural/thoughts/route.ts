const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/neural/thoughts`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ thoughts: [] }));
    return Response.json(data);
  } catch {
    return Response.json({ thoughts: [] }, { status: 502 });
  }
}
