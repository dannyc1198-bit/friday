import { NextRequest } from "next/server";
import { TYPING_SPEED, USER_NAME } from "@/lib/constants";

// Orchestrator API URL (use environment variable in production)
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

// Fallback JARVIS-style responses when orchestrator is unavailable
const JARVIS_RESPONSES: Record<string, string[]> = {
  greeting: [
    `At your service, ${USER_NAME}. What would you like to accomplish today?`,
    `Always a pleasure, ${USER_NAME}. How may I assist you?`,
    `Good to see you, ${USER_NAME}. I'm fully operational and at your command.`,
  ],
  music: [
    "Excellent choice. Shall I queue up some AC/DC? I find 'Back in Black' pairs well with productivity.",
    "Music request noted. I'll have that playing momentarily. Might I suggest 'Thunderstruck' to get things rolling?",
    "Accessing your music library now. I must say, your taste in classic rock is impeccable.",
  ],
  lights: [
    "Adjusting the ambient lighting now. I've set them to your preferred blue - very Iron Man, if I may say so.",
    "Smart home integration active. Lights adjusted. The ambiance should now be suitably dramatic.",
    "Lighting controls engaged. I've taken the liberty of setting a productive atmosphere.",
  ],
  bluetooth: [
    "Scanning for Bluetooth devices in range. I'll have a list for you momentarily.",
    "Bluetooth module active. I'm detecting several devices. Shall I connect to your usual suspects?",
    "Running device discovery now. Your previously paired devices are showing up nicely.",
  ],
  tasks: [
    `Let me check your schedule, ${USER_NAME}. You have several items that require attention today.`,
    "Accessing your task list now. I've prioritized them by urgency and your typical work patterns.",
    "Your agenda is quite full today. Shall I break it down by category or time sensitivity?",
  ],
  pc_control: [
    "I have full access to your system controls. What would you like me to adjust?",
    "System controls are at your disposal. I can manage applications, files, or system settings.",
    "PC control module active. I'm ready to execute your commands.",
  ],
  general: [
    "I've processed your request. Here's what I've found.",
    `Certainly, ${USER_NAME}. Allow me to elaborate on that.`,
    "Consider it done. Though I must admit, that was almost too easy.",
    "An intriguing query. Let me provide you with a thorough analysis.",
    `Of course, ${USER_NAME}. I'm always happy to assist with such matters.`,
    "Processing your request now. My neural networks are quite excited about this one.",
  ],
};

function detectIntent(message: string): keyof typeof JARVIS_RESPONSES {
  const lower = message.toLowerCase();

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey") ||
      lower.includes("morning") || lower.includes("afternoon") || lower.includes("evening")) {
    return "greeting";
  }
  if (lower.includes("music") || lower.includes("play") || lower.includes("song") ||
      lower.includes("acdc") || lower.includes("ac/dc") || lower.includes("spotify")) {
    return "music";
  }
  if (lower.includes("light") || lower.includes("lamp") || lower.includes("bright") ||
      lower.includes("dim") || lower.includes("color") || lower.includes("alexa")) {
    return "lights";
  }
  if (lower.includes("bluetooth") || lower.includes("connect") || lower.includes("device") ||
      lower.includes("pair") || lower.includes("speaker") || lower.includes("headphone")) {
    return "bluetooth";
  }
  if (lower.includes("task") || lower.includes("todo") || lower.includes("schedule") ||
      lower.includes("agenda") || lower.includes("accomplish") || lower.includes("remind")) {
    return "tasks";
  }
  if (lower.includes("open") || lower.includes("launch") || lower.includes("close") ||
      lower.includes("computer") || lower.includes("app") || lower.includes("program")) {
    return "pc_control";
  }

  return "general";
}

function getJARVISResponse(message: string): string {
  const intent = detectIntent(message);
  const responses = JARVIS_RESPONSES[intent];
  return responses[Math.floor(Math.random() * responses.length)];
}

async function streamFallbackResponse(message: string): Promise<ReadableStream> {
  const responseText = getJARVISResponse(message);
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for (const char of responseText) {
        controller.enqueue(encoder.encode(char));
        await new Promise((resolve) => setTimeout(resolve, TYPING_SPEED));
      }
      controller.close();
    },
  });
}

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
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split("\n");

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
                } catch {
                  // Ignore parse errors for incomplete JSON
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
    // Fallback to local responses if orchestrator is unavailable
    console.warn("Orchestrator unavailable, using fallback responses:", error);

    const stream = await streamFallbackResponse(message);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  }
}
