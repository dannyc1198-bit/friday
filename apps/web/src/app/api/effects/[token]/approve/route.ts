import { orchestratorAuth } from "@/lib/orchestrator";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { token: string } }
) {
  if (!/^effect_[A-Za-z0-9_]+$/.test(params.token)) {
    return Response.json({ error: "Unknown approval." }, { status: 400 });
  }
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/effects/${encodeURIComponent(params.token)}/approve`, {
      method: "POST",
      headers: orchestratorAuth(),
    });
    const data = await res.json().catch(() => ({ error: "Approval failed." }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: "Approval failed." }, { status: 502 });
  }
}
