import { NextRequest } from "next/server";

// Orchestrator API URL (use environment variable in production)
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  const { message, conversationId } = await request.json();

  if (!message) {
    return new Response("Message is required", { status: 400 });
  }

  // Try to connect to orchestrator
  try {
    const orchestratorResponse = await fetch(`${ORCHESTRATOR_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!orchestratorResponse.ok) {
      throw new Error(`Orchestrator returned ${orchestratorResponse.status}`);
    }

    // Transform SSE from orchestrator to plain text stream for frontend
    const reader = orchestratorResponse.body?.getReader();
    if (!reader) {
      throw new Error("No response body from orchestrator");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // keep incomplete last line for next chunk

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "text" && data.content) {
                    controller.enqueue(encoder.encode(data.content));
                  } else if (data.type === "tool_result" && data.result?.message) {
                    controller.enqueue(encoder.encode(`\n\n✓ ${data.result.message}\n\n`));
                  } else if (data.type === "error") {
                    controller.enqueue(encoder.encode(`\n\n⚠ Error: ${data.content}\n`));
                  }
                } catch (parseErr) {
                  console.error("[chat/route] Malformed SSE data line:", line);
                }
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    // Tell the user the truth — don't mask a broken backend with fake responses
    console.error("[chat/route] Orchestrator connection failed:", error);

    const errorMessage = "I'm having trouble connecting to my core systems, sir. " +
      "The orchestrator may be down or unreachable. " +
      "Please check that it is running on port 3001.";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
