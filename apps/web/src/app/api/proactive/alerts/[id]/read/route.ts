import { orchestratorAuth } from "@/lib/orchestrator";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/proactive/alerts/${encodeURIComponent(params.id)}/read`, {
      method: "POST",
      headers: orchestratorAuth(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ ok: false }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ ok: false, error: "Orchestrator unreachable" }, { status: 502 });
  }
}
