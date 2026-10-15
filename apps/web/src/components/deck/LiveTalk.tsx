"use client";

import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { noticesFromRealtimeEvent } from "@/lib/realtime-notices";
import { handsFreeStatus } from "@/lib/voice-status";

interface TranscriptLine {
  id: string;
  role: "user" | "agent";
  text: string;
}

export function LiveTalk({
  active,
  muted,
  onAgent,
}: {
  active: boolean;
  muted: boolean;
  onAgent: (connected: boolean) => void;
}) {
  const [note, setNote] = useState("Checking the live voice.");
  const [engine, setEngine] = useState<"elevenlabs" | "realtime" | "speak" | "">("");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [hasElevenKey, setHasElevenKey] = useState(false);
  const [hasOpenAI, setHasOpenAI] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/live", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { mode?: string; note?: string; hasElevenKey?: boolean; hasOpenAI?: boolean }) => {
        if (cancelled) return;
        setHasElevenKey(Boolean(data.hasElevenKey));
        setHasOpenAI(Boolean(data.hasOpenAI));
        setNote(data.note || handsFreeStatus({ connected: null, failed: null, hasElevenKey: Boolean(data.hasElevenKey) }));
        const mode = data.mode === "elevenlabs" || data.mode === "realtime" ? data.mode : "speak";
        setEngine(mode);
      })
      .catch(() => {
        if (!cancelled) {
          setEngine("speak");
          setNote(handsFreeStatus({ connected: null, failed: null, hasElevenKey: false }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) onAgent(false);
  }, [active, onAgent]);

  function push(role: "user" | "agent", text: string) {
    const clean = text.trim();
    if (!clean) return;
    setLines((prev) => [...prev.slice(-11), { id: `${Date.now()}-${prev.length}`, role, text: clean }]);
  }

  if (!active) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-5 pt-4" aria-live="polite">
      <p className="font-deckmono text-xs uppercase tracking-[0.22em] text-deck-hot">{note}</p>
      <ul className="mt-3 grid gap-2">
        {lines.length === 0 && engine !== "speak" && (
          <li className="text-sm text-deck-dim">Transcript shows here as soon as someone speaks.</li>
        )}
        {lines.map((line) => (
          <li key={line.id}>
            <span className="font-deckmono text-[10px] uppercase tracking-wider text-deck-dim">
              {line.role === "user" ? "You" : "Friday"}
            </span>
            <p className="text-base leading-relaxed text-deck-ink">{line.text}</p>
          </li>
        ))}
      </ul>
      {engine === "elevenlabs" && (
        <ConversationProvider
          onConnect={() => {
            onAgent(true);
            setNote(handsFreeStatus({ connected: "elevenlabs", failed: null, hasElevenKey }));
          }}
          onDisconnect={() => onAgent(false)}
          onMessage={(payload) => push(payload.role === "user" ? "user" : "agent", payload.message)}
          onError={() => {
            onAgent(false);
            if (hasOpenAI) {
              setNote("The ElevenLabs agent did not connect. Trying OpenAI Realtime.");
              setEngine("realtime");
              return;
            }
            setNote(handsFreeStatus({ connected: null, failed: "elevenlabs", hasElevenKey }));
            setEngine("speak");
          }}
        >
          <ElevenSession
            active={active}
            muted={muted}
            onFail={() => {
              if (hasOpenAI) {
                setNote("The ElevenLabs agent did not connect. Trying OpenAI Realtime.");
                setEngine("realtime");
                return;
              }
              setNote(handsFreeStatus({ connected: null, failed: "elevenlabs", hasElevenKey }));
              setEngine("speak");
            }}
          />
        </ConversationProvider>
      )}
      {engine === "realtime" && (
        <RealtimeSession
          active={active}
          muted={muted}
          onLine={push}
          onAgent={(connected) => {
            onAgent(connected);
            if (connected) setNote(handsFreeStatus({ connected: "realtime", failed: null, hasElevenKey }));
          }}
          onFail={() => {
            setNote(handsFreeStatus({ connected: null, failed: "realtime", hasElevenKey }));
            setEngine("speak");
            onAgent(false);
          }}
        />
      )}
    </section>
  );
}

function ElevenSession({
  active,
  muted,
  onFail,
}: {
  active: boolean;
  muted: boolean;
  onFail: () => void;
}) {
  const conversation = useConversation();
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const failed = useRef(onFail);
  failed.current = onFail;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/voice/elevenlabs/token", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !data.token) throw new Error(data.error || "no token");
        if (cancelled) return;
        conversationRef.current.startSession({ conversationToken: data.token });
      })
      .catch(() => {
        if (!cancelled) failed.current();
      });
    return () => {
      cancelled = true;
      conversationRef.current.endSession();
    };
  }, [active]);

  useEffect(() => {
    conversationRef.current.setVolume({ volume: muted ? 0 : 1 });
  }, [muted]);

  return null;
}

function RealtimeSession({
  active,
  muted,
  onLine,
  onAgent,
  onFail,
}: {
  active: boolean;
  muted: boolean;
  onLine: (role: "user" | "agent", text: string) => void;
  onAgent: (connected: boolean) => void;
  onFail: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onLineRef = useRef(onLine);
  const onAgentRef = useRef(onAgent);
  const onFailRef = useRef(onFail);
  onLineRef.current = onLine;
  onAgentRef.current = onAgent;
  onFailRef.current = onFail;

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!active) return;
    const session = { disposed: false };
    const abort = new AbortController();
    let pc: RTCPeerConnection | null = null;
    let local: MediaStream | null = null;
    const audio = new Audio();
    audio.autoplay = true;
    audioRef.current = audio;

    const release = () => {
      session.disposed = true;
      abort.abort();
      local?.getTracks().forEach((track) => track.stop());
      local = null;
      pc?.close();
      pc = null;
      audio.srcObject = null;
      onAgentRef.current(false);
    };

    (async () => {
      const sessionRes = await fetch("/api/voice/realtime/session", { method: "POST", signal: abort.signal });
      if (session.disposed) return;
      const body = (await sessionRes.json()) as { token?: string; error?: string };
      if (session.disposed) return;
      if (!sessionRes.ok || !body.token) throw new Error(body.error || "no session");
      pc = new RTCPeerConnection();
      if (session.disposed) {
        pc.close();
        pc = null;
        return;
      }
      pc.ontrack = (event) => {
        if (session.disposed) return;
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
        onAgentRef.current(true);
      };
      local = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session.disposed) {
        local.getTracks().forEach((track) => track.stop());
        local = null;
        pc?.close();
        pc = null;
        return;
      }
      pc.addTrack(local.getTracks()[0], local);
      const channel = pc.createDataChannel("oai-events");
      channel.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }
        for (const notice of noticesFromRealtimeEvent(parsed)) {
          if (notice.kind === "tool" && notice.callId && notice.name) {
            void fetch("/api/voice/realtime/tool", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: notice.name, arguments: notice.arguments }),
            })
              .then((res) => res.json())
              .then((body: { output?: string }) => {
                if (session.disposed || channel.readyState !== "open") return;
                channel.send(JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: notice.callId,
                    output: body.output || "{}",
                  },
                }));
                channel.send(JSON.stringify({ type: "response.create" }));
              })
              .catch(() => undefined);
            continue;
          }
          if (notice.kind !== "tool") onLineRef.current(notice.kind, notice.text);
        }
      };
      const offer = await pc.createOffer();
      if (session.disposed) return;
      await pc.setLocalDescription(offer);
      if (session.disposed) return;
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${body.token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
        signal: abort.signal,
      });
      if (session.disposed) return;
      if (!sdp.ok) throw new Error("realtime call failed");
      const answer = await sdp.text();
      if (session.disposed || !pc) {
        local?.getTracks().forEach((track) => track.stop());
        local = null;
        pc?.close();
        pc = null;
        return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    })().catch((err: unknown) => {
      if (session.disposed || (err instanceof DOMException && err.name === "AbortError")) return;
      onFailRef.current();
    });

    return release;
  }, [active]);

  return null;
}
