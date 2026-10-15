import { orchestratorAuth } from "@/lib/orchestrator";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/voice/elevenlabs/token`, { cache: "no-store", headers: orchestratorAuth() });
    const data = await res.json().catch(() => ({ error: "No token." }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "ElevenLabs token unavailable." }, { status: 502 });
  }
}
