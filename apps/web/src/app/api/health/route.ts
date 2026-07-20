// Health proxy — the StatusStrip's heartbeat.
//
// The old version of this route returned { ok: true } unconditionally — the
// status chip claimed "connected" even with the orchestrator dead. Now it
// actually asks the orchestrator and returns the rich payload (llm
// provider/model, tool count, tts) so the strip can be honest.

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/health`, {
      headers: { Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) {
      return Response.json({ ok: false, error: `orchestrator ${r.status}` }, { status: 502 });
    }
    return Response.json(await r.json());
  } catch {
    return Response.json({ ok: false, error: "orchestrator unreachable" }, { status: 502 });
  }
}
