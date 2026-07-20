import { NextResponse } from "next/server";

// Triggers the orchestrator to (re)generate today's AI coach line.
const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const KEY = process.env.FRIDAY_API_KEY || "";

export async function POST() {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/dashboard/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Orchestrator unreachable" }, { status: 503 });
  }
}
