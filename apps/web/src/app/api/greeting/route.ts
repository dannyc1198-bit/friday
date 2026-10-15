const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/greeting`, { cache: "no-store" });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ bootId: "offline", status: "heard", text: "" }, { status: 502 });
  }
}

export async function POST() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/greeting`, { method: "POST" });
    if (res.status === 204) return new Response(null, { status: 204 });
    const type = res.headers.get("content-type") || "";
    if (type.includes("audio")) {
      const bytes = await res.arrayBuffer();
      return new Response(bytes, {
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Greeting-Already": "0",
          "X-Greeting-Text": res.headers.get("x-greeting-text") || "",
        },
      });
    }
    const data = await res.json().catch(() => ({ audio: false }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ audio: false }, { status: 502 });
  }
}
