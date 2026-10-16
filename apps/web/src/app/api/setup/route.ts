const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/setup`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ ready: false, checks: [] }));
    return Response.json(data);
  } catch {
    return Response.json({
      ready: false,
      checks: [
        {
          id: "core",
          label: "Orchestrator",
          ok: false,
          env: "ORCHESTRATOR_URL",
          detail: "The orchestrator on port 3001 did not answer. Start the core, then refresh.",
        },
      ],
    }, { status: 502 });
  }
}
