"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Message, ToolActivity } from "@/types";
import { generateId } from "@/lib/utils";
import { SAMPLE_THREAD } from "@/lib/demo-boundary";
import { readDemo } from "@/components/deck/demo";
import { setMindspaceSpeaker } from "@/lib/mindspace-voice";

// localStorage keys for persistence across reloads
const ACTIVE_CONV_KEY = "FRIDAY_active_conversation_id";
const MESSAGES_KEY_PREFIX = "FRIDAY_messages_";

// Pull a short human label out of tool parameters for the cognition chip:
// brain_recall {query:"dan martell"} → `"dan martell"`.
function extractDetail(parameters: unknown): string | undefined {
  if (!parameters || typeof parameters !== "object") return undefined;
  const p = parameters as Record<string, unknown>;
  for (const key of ["query", "entity", "title", "note", "name", "url", "app", "task", "text"]) {
    const v = p[key];
    if (typeof v === "string" && v.trim()) {
      return v.length > 42 ? v.slice(0, 39) + "…" : v;
    }
  }
  return undefined;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [approval, setApproval] = useState<{ token: string; detail: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<string | null>(null);

  const sampleMessages = useCallback((): Message[] => {
    return SAMPLE_THREAD.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: new Date(item.timestamp),
    }));
  }, []);

  // ─── Hydrate from localStorage on mount ────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyDemo = () => {
      if (!readDemo()) return false;
      setMessages(sampleMessages());
      return true;
    };
    const onDemo = () => {
      if (applyDemo()) return;
      try {
        const storedId = localStorage.getItem(ACTIVE_CONV_KEY);
        setConversationId(storedId);
        conversationRef.current = storedId;
        if (!storedId) {
          setMessages([]);
          return;
        }
        const stored = localStorage.getItem(MESSAGES_KEY_PREFIX + storedId);
        setMessages(stored ? (JSON.parse(stored) as Message[]).map((m) => ({ ...m, timestamp: new Date(m.timestamp) })) : []);
      } catch {
        setMessages([]);
      }
    };
    window.addEventListener("friday-demo", onDemo);
    if (applyDemo()) return () => window.removeEventListener("friday-demo", onDemo);
    try {
      const storedId = localStorage.getItem(ACTIVE_CONV_KEY);
      if (storedId) {
        setConversationId(storedId);
        conversationRef.current = storedId;
        const stored = localStorage.getItem(MESSAGES_KEY_PREFIX + storedId);
        if (stored) {
          const parsed = JSON.parse(stored) as Message[];
          setMessages(parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
        }
      }
    } catch {
      // localStorage may be unavailable (private mode, quota) — non-fatal
    }
    return () => window.removeEventListener("friday-demo", onDemo);
  }, [sampleMessages]);

  // ─── Persist messages on every change ──────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !conversationId || readDemo()) return;
    if (messages.length === 0) return;
    try {
      localStorage.setItem(MESSAGES_KEY_PREFIX + conversationId, JSON.stringify(messages));
    } catch {
      // Storage quota exceeded — conversation still works in-memory
    }
  }, [messages, conversationId]);

  const setInitialMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (readDemo()) {
      setError("Demo mode does not send. Nothing left this browser.");
      return;
    }
    if (!content.trim() || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setMindspaceSpeaker(null);

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const assistantId = generateId();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: new Date(), isStreaming: true, activity: [] },
    ]);
    setIsLoading(true);

    // Local mutable mirrors — applied to state via functional updates so the
    // streaming render stays consistent under React batching.
    let textAcc = "";
    let activityAcc: ToolActivity[] = [];

    const applyUpdate = () => {
      const snapshotText = textAcc;
      const snapshotActivity = [...activityAcc];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: snapshotText, activity: snapshotActivity } : m
        )
      );
    };

    const handleEvent = (data: Record<string, unknown>) => {
      const type = data.type as string;
      if (type === "text" && typeof data.content === "string") {
        textAcc += data.content;
        applyUpdate();
      } else if (type === "tool_call") {
        activityAcc = [
          ...activityAcc,
          {
            id: generateId(),
            tool: String(data.tool || "tool"),
            detail: extractDetail(data.parameters),
            status: "running",
          },
        ];
        applyUpdate();
      } else if (type === "tool_result") {
        const result = data.result as { needsApproval?: boolean; token?: string; action?: string; destination?: string; content?: string; amount?: string } | undefined;
        if (result?.needsApproval && result.token) {
          setApproval({
            token: result.token,
            detail: `${result.action || "submit"} · ${result.destination || "unknown page"} · ${result.content || ""} · ${result.amount || "unspecified"}`,
          });
        }
        const tool = String(data.tool || "");
        // Settle the most recent running chip for this tool.
        for (let i = activityAcc.length - 1; i >= 0; i--) {
          if (activityAcc[i].status === "running" && (!tool || activityAcc[i].tool === tool)) {
            activityAcc = activityAcc.map((a, idx) =>
              idx === i ? { ...a, status: data.success === false ? "error" : "done" } : a
            );
            break;
          }
        }
        applyUpdate();
      } else if (type === "voice" && typeof data.specialist === "string" && typeof data.edge === "string") {
        setMindspaceSpeaker({ specialist: data.specialist, edge: data.edge });
      } else if (type === "error" && typeof data.content === "string") {
        setError(data.content);
        textAcc += (textAcc ? "\n\n" : "") + data.content;
        applyUpdate();
      }
      // type === "done" → stream end handled by reader loop
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Failed to send message");

      const serverConvId = response.headers.get("X-Conversation-Id");
      if (serverConvId && serverConvId !== conversationId) {
        setConversationId(serverConvId);
        conversationRef.current = serverConvId;
        if (typeof window !== "undefined") {
          try { localStorage.setItem(ACTIVE_CONV_KEY, serverConvId); } catch {}
        }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)));
          } catch {
            // malformed SSE line — skip, never crash the stream
          }
        }
      }

      // Any chip still "running" at stream end errored server-side.
      activityAcc = activityAcc.map((a) => (a.status === "running" ? { ...a, status: "error" } : a));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: textAcc, activity: [...activityAcc], isStreaming: false }
            : m
        )
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
        );
        return;
      }
      setError(err instanceof Error ? err.message : "An error occurred");
      // Keep the bubble if anything streamed; drop the empty shell otherwise.
      setMessages((prev) =>
        textAcc
          ? prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
          : prev.filter((m) => m.id !== assistantId)
      );
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }, [isLoading, conversationId]);

  const stopTask = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const id = conversationRef.current;
    if (!id || readDemo()) return;
    try {
      await fetch("/api/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      });
    } catch (err) {
      console.warn("[useChat] Failed to send stop signal — server task may still be running:", err);
    }
  }, []);

  const decideApproval = useCallback(async (approved: boolean) => {
    const pending = approval;
    setApproval(null);
    if (!pending || !approved || readDemo()) return;
    try {
      const response = await fetch(`/api/effects/${encodeURIComponent(pending.token)}/approve`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error || "That browser submission was not approved.");
    } catch {
      setError("That browser submission was not approved.");
    }
  }, [approval]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Start a fresh server-side conversation: without clearing conversationId,
  // "clear" only wipes the screen while the orchestrator keeps appending to
  // the same thread.
  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setError(null);
    setConversationId(null);
    conversationRef.current = null;
    setIsLoading(false);
    if (typeof window !== "undefined") {
      try { localStorage.removeItem(ACTIVE_CONV_KEY); } catch {}
    }
  }, []);

  // Resume a past conversation from the on-disk transcript (history rail).
  const loadConversation = useCallback((id: string, msgs: Message[]) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConversationId(id);
    conversationRef.current = id;
    setMessages(msgs);
    setError(null);
    setIsLoading(false);
    if (typeof window !== "undefined") {
      try { localStorage.setItem(ACTIVE_CONV_KEY, id); } catch {}
    }
  }, []);

  return {
    messages,
    setMessages,
    setInitialMessages,
    isLoading,
    error,
    sendMessage,
    stopTask,
    approval,
    decideApproval,
    clearMessages,
    newConversation,
    loadConversation,
  };
}
