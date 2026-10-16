import { orchestratorAuth } from "@/lib/orchestrator";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/voice/realtime/exhausted`, {
      method: "POST",
      headers: orchestratorAuth({ "Content-Type": "application/json" }),
      body: "{}",
    });
    const data = await res.json().catch(() => ({ mode: "speak" }));
    return Response.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ mode: "speak" }, { status: 502 });
  }
}
