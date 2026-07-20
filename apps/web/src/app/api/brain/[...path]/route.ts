// Brain proxy — feeds the Mind panel.
//
// Forwards /api/brain/* to the orchestrator with the server-side bearer key
// (the browser never sees FRIDAY_API_KEY, and the orchestrator binds to
// 127.0.0.1 with CORS locked — the Next server is the trusted middleman).
//
// Allowed: GET status | GET recent | POST search | POST reflect | POST reindex

import { NextRequest } from "next/server";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const GET_PATHS = new Set(["status", "recent"]);
const POST_PATHS = new Set(["search", "reflect", "reindex"]);

export const dynamic = "force-dynamic";

async function forward(path: string, init: RequestInit): Promise<Response> {
  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/api/brain/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(path === "reflect" ? 120_000 : 8000),
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({ error: "orchestrator unreachable" }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = (params.path || []).join("/");
  if (!GET_PATHS.has(path)) return Response.json({ error: "not found" }, { status: 404 });
  const qs = request.nextUrl.search || "";
  return forward(path + qs, { method: "GET" });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = (params.path || []).join("/");
  if (!POST_PATHS.has(path)) return Response.json({ error: "not found" }, { status: 404 });
  const body = await request.text();
  return forward(path, { method: "POST", body: body || "{}" });
}
