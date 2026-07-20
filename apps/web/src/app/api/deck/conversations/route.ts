// Conversation history list — proxied so the browser never needs the API key.

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/conversations`, {
      headers: { Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}` },
      cache: "no-store",
    });
    return Response.json(await res.json());
  } catch {
    return Response.json({ conversations: [] });
  }
}
