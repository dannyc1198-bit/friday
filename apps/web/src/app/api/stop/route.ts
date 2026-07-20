import { NextRequest } from "next/server";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const response = await fetch(`${ORCHESTRATOR_URL}/api/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return Response.json(data);
  } catch {
    return Response.json({ stopped: false, error: "Orchestrator unavailable" }, { status: 503 });
  }
}
