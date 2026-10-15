const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/upkeep/repairs/${encodeURIComponent(params.id)}/reject`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({ error: "Reject failed." }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: "Reject failed." }, { status: 502 });
  }
}
