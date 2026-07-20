import { NextResponse } from "next/server";

// One proxy for all one-tap logs. Body must include `kind`; the rest is
// forwarded to the matching orchestrator endpoint with the API key attached.
const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const KEY = process.env.FRIDAY_API_KEY || "";

const PATHS: Record<string, string> = {
  caffeine: "/api/dashboard/log/caffeine",
  supplements: "/api/dashboard/log/supplements",
  manual: "/api/dashboard/log/manual",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const kind = typeof body?.kind === "string" ? body.kind : "";
    const path = PATHS[kind];
    if (!path) {
      return NextResponse.json({ error: "Unknown log kind" }, { status: 400 });
    }
    const { kind: _omit, ...payload } = body;
    const res = await fetch(`${ORCHESTRATOR}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(payload),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Orchestrator unreachable" }, { status: 503 });
  }
}
