import { NextRequest } from "next/server";

// Deck instrument proxy — lets the rails read live fleet/market/intel data
// through the orchestrator's tool registry WITHOUT going through the LLM.
// Read-only allowlist on purpose: launching/stopping agents stays a FRIDAY
// (chat) action, not a dashboard button.

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

const READ_ONLY_TOOLS = new Set([
  "fleet_status",
  "market_snapshot",
  "intel_news",
  "intel_risk",
]);

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { tool, parameters } = await request.json().catch(() => ({}));

  if (!tool || !READ_ONLY_TOOLS.has(tool)) {
    return Response.json({ success: false, error: "Tool not allowed" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/tools/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
      },
      body: JSON.stringify({ tool, parameters: parameters || {} }),
      signal: controller.signal,
    });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({
      success: false,
      error: "Orchestrator unreachable on :3001",
    });
  } finally {
    clearTimeout(timer);
  }
}
