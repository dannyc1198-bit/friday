import { NextResponse } from "next/server";

// Proxy: browser → here (same-origin, no secret) → orchestrator (with key).
// Mirrors apps/web/src/app/api/briefing/morning/route.ts.
const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const KEY = process.env.FRIDAY_API_KEY || "";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/dashboard/today`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Dashboard unavailable" }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Orchestrator unreachable" }, { status: 503 });
  }
}
