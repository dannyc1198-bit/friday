// Keep in step with apps/web/src/lib/realtime-notices.ts.
// The web bundle cannot import this package, and this package cannot import the web app.

export interface RealtimeNotice {
  kind: "user" | "agent" | "tool";
  text: string;
  name?: string;
  callId?: string;
  arguments?: string;
}

export function noticesFromRealtimeEvent(event: unknown): RealtimeNotice[] {
  if (!event || typeof event !== "object") return [];
  const record = event as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";

  if (type === "conversation.item.input_audio_transcription.completed") {
    const text = stringField(record, "transcript");
    return text ? [{ kind: "user", text }] : [];
  }
  if (type === "response.output_audio_transcript.done") {
    const text = stringField(record, "transcript");
    return text ? [{ kind: "agent", text }] : [];
  }
  if (type === "response.function_call_arguments.done" || type === "response.output_item.done") {
    const item = type === "response.output_item.done" && record.item && typeof record.item === "object"
      ? (record.item as Record<string, unknown>)
      : record;
    if (type === "response.output_item.done" && item.type !== "function_call") return [];
    const name = stringField(item, "name");
    return [{
      kind: "tool",
      text: name || "tool",
      name,
      callId: stringField(item, "call_id"),
      arguments: stringField(item, "arguments") || "{}",
    }];
  }
  return [];
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}
