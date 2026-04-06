import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const AUTH = () => ({ Authorization: `Bearer ${process.env.JARVIS_API_KEY || ""}` });

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR}/api/proactive/alerts`, {
      headers: AUTH(),
      next: { revalidate: 0 },
    });
    if (!res.ok) return NextResponse.json({ alerts: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}

export async function DELETE() {
  try {
    await fetch(`${ORCHESTRATOR}/api/proactive/alerts`, {
      method: "DELETE",
      headers: AUTH(),
    });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: true });
}
