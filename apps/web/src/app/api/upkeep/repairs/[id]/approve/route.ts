import { orchestratorAuth } from "@/lib/orchestrator";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/upkeep/repairs/${encodeURIComponent(params.id)}/approve`, {
      method: "POST",
      headers: orchestratorAuth(),
    });
    const data = await res.json().catch(() => ({ error: "Approve failed." }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: "Approve failed." }, { status: 502 });
  }
}
