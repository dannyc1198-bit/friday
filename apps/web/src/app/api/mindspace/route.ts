const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/mindspace`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ specialists: [] }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ specialists: [], friday: { name: "FRIDAY", status: "idle" } }, { status: 502 });
  }
}
