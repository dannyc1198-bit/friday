import { NextRequest, NextResponse } from "next/server";

// Orchestrator API URL
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

/**
 * POST /api/tts — Proxy to orchestrator's ElevenLabs TTS endpoint.
 * Accepts { text } → returns audio/mpeg buffer or JSON error with fallback flag.
 */
export async function POST(request: NextRequest) {
  const { text, specialist } = await request.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
      },
      body: JSON.stringify({ text, specialist }),
    });

    // If orchestrator returns JSON error (503 = no API key, 500 = failure)
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const errorData = await response.json();
      return NextResponse.json(errorData, { status: response.status });
    }

    // Success — pipe the audio bytes through
    if (!response.ok) {
      return NextResponse.json(
        { error: "TTS generation failed", fallback: true },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.warn("TTS proxy error:", error);
    return NextResponse.json(
      { error: "TTS service unavailable", fallback: true },
      { status: 503 }
    );
  }
}

/**
 * GET /api/tts — Check TTS availability status.
 */
export async function GET() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/tts/status`, {
      headers: { Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}` },
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { available: false, provider: "elevenlabs", error: "Orchestrator unavailable" },
      { status: 503 }
    );
  }
}
