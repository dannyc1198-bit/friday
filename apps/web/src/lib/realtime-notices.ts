// Keep in step with apps/orchestrator/src/services/realtime-events.ts.

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

// A realtime call can connect at $0 credit, then fail on the first response.
// "credit" means drop to the free voice and tell the orchestrator; "error" means drop to it.
export function realtimeFailure(event: unknown): "credit" | "error" | null {
  if (!event || typeof event !== "object") return null;
  const record = event as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  let detail: unknown = null;
  if (type === "error") detail = record.error ?? record;
  if (type === "response.done") {
    const response = record.response as Record<string, unknown> | undefined;
    if (!response || response.status !== "failed") return null;
    detail = (response.status_details as Record<string, unknown> | undefined)?.error ?? response.status_details ?? response;
  }
  if (detail === null) return null;
  const text = JSON.stringify(detail);
  if (/insufficient_quota|credit_balance_exhausted|billing/i.test(text)) return "credit";
  return type === "response.done" ? "error" : /session|rate|quota|server_error|invalid_api_key/i.test(text) ? "error" : null;
}
