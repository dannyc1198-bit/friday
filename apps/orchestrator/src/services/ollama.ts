// FRIDAY Ollama service — Tier 0 local fallback (Gemma 4 by default).
// Runs on your machine, no API keys, no quota. Used when Claude and Gemini
// both fail. Matches streamChatCompletion / streamGeminiCompletion signature
// so the router can swap it in without special-casing.
//
// Tool calling is NOT supported here on purpose — Gemma 4 via Ollama doesn't
// match Claude/Gemini quality for agentic tool loops. Ollama answers in plain
// text only; if the user asks for a tool, it'll describe what to do. The
// tier-0 path is "degraded mode": keep the assistant responsive, even if it
// can't fire actions.

import type { Message, StreamChunk } from "../types/index.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

function toOllamaMessages(messages: Message[], systemPromptExtras?: string) {
  const out: Array<{ role: string; content: string }> = [];
  if (systemPromptExtras) {
    out.push({ role: "system", content: systemPromptExtras });
  }
  for (const m of messages) {
    if (m.role === "tool") continue; // Ollama chat API doesn't use tool role here
    out.push({
      role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    });
  }
  return out;
}

export async function* streamOllamaCompletion(
  messages: Message[],
  signal?: AbortSignal,
  systemPromptExtras?: string
): AsyncGenerator<StreamChunk> {
  const body = {
    model: OLLAMA_MODEL,
    messages: toOllamaMessages(messages, systemPromptExtras),
    stream: true,
  };

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          const chunk = evt?.message?.content as string | undefined;
          if (chunk) yield { type: "text", content: chunk };
          if (evt?.done) {
            yield { type: "done" };
            return;
          }
        } catch {
          // ignore malformed line; NDJSON stream may split mid-chunk
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  yield { type: "done" };
}
