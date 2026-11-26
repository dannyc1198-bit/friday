// Pushes ear state and TTS audio to connected desktop renderers.
// The Electron main process is the client. It holds the Bearer key.

import type { WebSocket } from "ws";

export interface EarSnapshot {
  speech?: { id: string; text: string; playback: string } | null;
  [key: string]: unknown;
}

interface LiveClient {
  socket: WebSocket;
}

const clients = new Set<LiveClient>();
const started = new Set<string>();

export function liveListenerCount(): number {
  return clients.size;
}

export function addLiveClient(socket: WebSocket): () => void {
  const client = { socket };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

function send(client: LiveClient, data: string | Buffer) {
  if (client.socket.readyState !== client.socket.OPEN) return;
  client.socket.send(data);
}

export function publish(data: string | Buffer) {
  for (const client of clients) send(client, data);
}

export function notifyEar(status: EarSnapshot) {
  publish(JSON.stringify({
    type: "state",
    status,
    listeners: clients.size,
  }));
  const speech = status.speech;
  if (!speech || speech.playback !== "pending" || clients.size === 0 || started.has(speech.id)) return;
  started.add(speech.id);
  if (started.size > 40) {
    const oldest = started.values().next().value;
    if (oldest) started.delete(oldest);
  }
  void pushAudio(speech.id, speech.text);
}

export function publishInterrupt() {
  publish(JSON.stringify({ type: "interrupt" }));
}

async function pushAudio(id: string, text: string) {
  try {
    const { textToSpeech } = await import("../tts.js");
    const audio = await textToSpeech(text.slice(0, 1500));
    if (!audio || clients.size === 0) return;
    publish(JSON.stringify({ type: "audio", id, mime: "audio/mpeg", bytes: audio.length }));
    publish(audio);
  } catch {
    publish(JSON.stringify({ type: "audio_unavailable", id }));
  }
}
