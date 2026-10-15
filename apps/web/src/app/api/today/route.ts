const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/today`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ task: null }));
    return Response.json(data);
  } catch {
    return Response.json({ task: null }, { status: 502 });
  }
}
