import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/briefing/morning`, {
      headers: { Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}` },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Briefing unavailable" }, { status: 503 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Orchestrator unreachable" }, { status: 503 });
  }
}
