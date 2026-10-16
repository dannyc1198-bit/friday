const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/tasks`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ tasks: [], error: "tasks could not be read" }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ tasks: [], error: "Orchestrator unreachable" }, { status: 502 });
  }
}
