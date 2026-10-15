const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/voice/live`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ mode: "browser", note: "Voice plan unavailable." }));
    return Response.json(data);
  } catch {
    return Response.json({ mode: "browser", note: "Voice plan unavailable. The browser voice still speaks." }, { status: 502 });
  }
}
