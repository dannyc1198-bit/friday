const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") || "";
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/neural/note?path=${encodeURIComponent(path)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ error: "No note." }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "Friday's orchestrator did not answer." }, { status: 502 });
  }
}