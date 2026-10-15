"use client";

import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { noticesFromRealtimeEvent } from "@/lib/realtime-notices";

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
  const [engine, setEngine] = useState<"elevenlabs" | "realtime" | "browser" | "">("");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/live", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { mode?: string; note?: string }) => {
        if (cancelled) return;
        setNote(data.note || "Live voice ready.");
        const mode = data.mode === "elevenlabs" || data.mode === "realtime" ? data.mode : "browser";
        setEngine(mode);
      })
      .catch(() => {
        if (!cancelled) {
          setEngine("browser");
          setNote("Voice plan unavailable. The browser voice still speaks.");
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
      {problem && <p className="mt-2 text-sm text-deck-gold">{problem}</p>}
      <ul className="mt-3 grid gap-2">
        {lines.length === 0 && engine !== "browser" && (
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
          onConnect={() => onAgent(true)}
          onDisconnect={() => onAgent(false)}
          onMessage={(payload) => push(payload.role === "user" ? "user" : "agent", payload.message)}
          onError={() => {
            setProblem("ElevenLabs did not connect. Trying OpenAI Realtime.");
            setEngine("realtime");
            onAgent(false);
          }}
        >
          <ElevenSession
            active={active}
            muted={muted}
            onFail={() => {
              setProblem("ElevenLabs did not connect. Trying OpenAI Realtime.");
              setEngine("realtime");
            }}
          />
        </ConversationProvider>
      )}
      {engine === "realtime" && (
        <RealtimeSession
          active={active}
          muted={muted}
          onLine={push}
          onAgent={onAgent}
          onFail={() => {
            setProblem("Realtime voice did not connect. The browser voice will speak each reply.");
            setEngine("browser");
            onAgent(false);
          }}
        />
      )}
      {engine === "browser" && (
        <p className="mt-2 text-sm text-deck-dim">
          Hands-free is listening in the browser. Friday answers out loud, and the chat is the transcript.
        </p>
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
    let closed = false;
    let pc: RTCPeerConnection | null = null;
    let local: MediaStream | null = null;
    const audio = new Audio();
    audio.autoplay = true;
    audioRef.current = audio;

    (async () => {
      const sessionRes = await fetch("/api/voice/realtime/session", { method: "POST" });
      const session = (await sessionRes.json()) as { token?: string; error?: string };
      if (!sessionRes.ok || !session.token) throw new Error(session.error || "no session");
      pc = new RTCPeerConnection();
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
        onAgentRef.current(true);
      };
      local = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      await pc.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdp.ok) throw new Error("realtime call failed");
      const answer = await sdp.text();
      if (closed || !pc) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    })().catch(() => {
      if (!closed) onFailRef.current();
    });

    return () => {
      closed = true;
      local?.getTracks().forEach((track) => track.stop());
      pc?.close();
      audio.srcObject = null;
      onAgentRef.current(false);
    };
  }, [active]);

  return null;
}
