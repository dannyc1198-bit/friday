import { orchestratorAuth } from "@/lib/orchestrator";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await fetch(`${ORCHESTRATOR_URL}/api/greeting/heard`, { method: "POST", headers: orchestratorAuth() });
  } catch {
    // The tab still remembers this boot locally.
  }
  return Response.json({ ok: true });
}
