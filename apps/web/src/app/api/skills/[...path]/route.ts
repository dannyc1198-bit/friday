import { NextRequest } from "next/server";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";
const GET_PATHS = new Set(["overview", "active", "proposals"]);
const MUTATION_PATH = /^proposals\/skill_[0-9a-f-]+\/(apply|reject|rollback)$/;

export const dynamic = "force-dynamic";

async function forward(path: string, init: RequestInit): Promise<Response> {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/skills/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({ error: "orchestrator unreachable" }, { status: 502 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = (params.path || []).join("/");
  if (!GET_PATHS.has(path) && !/^proposals\/skill_[0-9a-f-]+$/.test(path)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return forward(path, { method: "GET" });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = (params.path || []).join("/");
  if (!MUTATION_PATH.test(path)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (request.headers.get("x-friday-approval") !== "approve") {
    return Response.json({ error: "explicit approval header required" }, { status: 400 });
  }
  return forward(path, { method: "POST", body: JSON.stringify({ approved: true }) });
}
