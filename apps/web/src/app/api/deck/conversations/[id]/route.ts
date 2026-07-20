import { NextRequest } from "next/server";

// Single conversation transcript — proxied so the browser never needs the API key.

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) {
    return Response.json({ error: "Bad id" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${ORCHESTRATOR_URL}/api/conversations/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}` },
        cache: "no-store",
      }
    );
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "Orchestrator unreachable" }, { status: 502 });
  }
}
