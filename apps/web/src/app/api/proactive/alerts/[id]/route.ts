import { NextResponse } from "next/server";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await fetch(`${ORCHESTRATOR}/api/proactive/alerts/${params.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.JARVIS_API_KEY || ""}` },
    });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: true });
}
