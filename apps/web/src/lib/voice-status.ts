// One status line for hands-free. A failed engine replaces the previous line.

export function handsFreeStatus(input: {
  connected: "elevenlabs" | "realtime" | null;
  failed: "elevenlabs" | "realtime" | null;
  hasElevenKey: boolean;
}): string {
  if (input.connected === "elevenlabs") return "ElevenLabs is in the conversation.";
  if (input.connected === "realtime") return "OpenAI Realtime is in the conversation.";
  if (input.failed === "realtime" && input.hasElevenKey) {
    return "OpenAI Realtime has no credits. ElevenLabs voice is speaking every reply, then Edge.";
  }
  if (input.failed === "realtime") {
    return "OpenAI Realtime has no credits. The Edge voice is speaking every reply.";
  }
  if (input.failed === "elevenlabs" && input.hasElevenKey) {
    return "The ElevenLabs agent did not connect. ElevenLabs voice is speaking every reply, then Edge.";
  }
  if (input.failed === "elevenlabs") {
    return "The ElevenLabs agent did not connect. The Edge voice is speaking every reply.";
  }
  return input.hasElevenKey
    ? "ElevenLabs voice is speaking every reply, then Edge."
    : "The Edge voice is speaking every reply.";
}
