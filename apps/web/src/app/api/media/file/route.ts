const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") || "";
  if (!/^[\w.-]+\.(glb|fbx|png|jpe?g|mp4|webp)$/i.test(name)) {
    return Response.json({ error: "Unknown media file" }, { status: 400 });
  }
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/media/file?name=${encodeURIComponent(name)}`, {
      cache: "no-store",
    });
    if (!res.ok || !res.body) return Response.json({ error: "Not found" }, { status: res.status });
    return new Response(res.body, {
      headers: { "Content-Type": res.headers.get("content-type") || "application/octet-stream" },
    });
  } catch {
    return Response.json({ error: "Orchestrator unreachable" }, { status: 502 });
  }
}
