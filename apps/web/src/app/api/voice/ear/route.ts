const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

function auth(): HeadersInit {
  return { Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}` };
}

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/voice/ear`, {
      headers: auth(),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const body = await res.json().catch(() => ({ error: "ear unavailable" }));
    return Response.json(body, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json(
      { phase: "asleep", muted: false, say: "", pending: null, nowPlaying: null, error: "orchestrator unreachable" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as { action?: string; text?: string; muted?: boolean }));
  const action = body?.action === "hear" ? "hear" : "mute";
  const path = action === "hear" ? "/api/voice/ear/hear" : "/api/voice/ear/mute";
  const payload = action === "hear"
    ? { text: String(body.text || ""), pushToTalk: true }
    : { muted: body.muted };
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({ error: "ear unavailable" }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ error: "orchestrator unreachable" }, { status: 502 });
  }
}
