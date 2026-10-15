import { NextRequest } from "next/server";

// Chat proxy — forwards the orchestrator's structured SSE to the browser.
//
// The old version flattened everything to plain text, which destroyed the
// tool_call / tool_result events — the window could never show WHAT FRIDAY
// was doing (recalling, remembering, browsing). Now events pass through
// verbatim as SSE lines and useChat renders them as cognition chips.
//
// Event shapes (orchestrator → browser, one JSON per `data:` line):
//   {type:"text", content}
//   {type:"tool_call", tool, parameters}
//   {type:"tool_result", tool, result, success}
//   {type:"error", content}
//   {type:"done", conversationId}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { message, conversationId } = await request.json();

  if (!message) {
    return new Response("Message is required", { status: 400 });
  }

  try {
    const orchestratorResponse = await fetch(`${ORCHESTRATOR_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
      },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!orchestratorResponse.ok || !orchestratorResponse.body) {
      const status = orchestratorResponse.status;
      const content =
        status === 401 || status === 403
          ? "The web app is missing FRIDAY_API_KEY. Put the same key in apps/web/.env.local and restart the window."
          : "I can't reach my core systems, boss — the orchestrator on port 3001 looks down. Start it and try me again.";
      const payload =
        `data: ${JSON.stringify({ type: "error", content })}\n\n` +
        `data: ${JSON.stringify({ type: "done" })}\n\n`;
      return new Response(payload, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    // Pass the SSE body through untouched — parsing happens client-side in
    // useChat, which is the only consumer.
    const convId = orchestratorResponse.headers.get("X-Conversation-Id");
    return new Response(orchestratorResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        ...(convId ? { "X-Conversation-Id": convId } : {}),
      },
    });
  } catch (error) {
    console.error("[chat/route] Orchestrator connection failed:", error);
    // Same SSE shape as the happy path so the client parser handles it.
    const payload =
      `data: ${JSON.stringify({
        type: "error",
        content:
          "I can't reach my core systems, boss — the orchestrator on port 3001 looks down. Start it and try me again.",
      })}\n\n` + `data: ${JSON.stringify({ type: "done" })}\n\n`;
    return new Response(payload, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}
