"use client";

// Voice page — ChatGPT Advanced Voice aesthetic.
// Dark background, glowing animated orb, minimal controls, status text.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";

const VoiceOrb = dynamic(
  () => import("@/components/VoiceOrb").then((m) => ({ default: m.VoiceOrb })),
  { ssr: false }
);

type OrbState = "idle" | "listening" | "thinking" | "speaking";

const STATE_LABELS: Record<OrbState, string> = {
  idle:      "",
  listening: "Listening",
  thinking:  "Thinking",
  speaking:  "Speaking",
};

export default function VoicePage() {
  const router = useRouter();
  const { messages, isLoading, sendMessage } = useChat();
  const voice = useVoice({
    messages,
    isLoading,
    onTranscript: sendMessage,
    enabled: true,
  });

  const [hasStarted, setHasStarted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Arm live mode on mount
  const liveModeArmed = useRef(false);
  useEffect(() => {
    if (liveModeArmed.current) return;
    liveModeArmed.current = true;
    if (!voice.isLiveMode) voice.toggleLiveMode();
  }, [voice]);

  const handleStart = async () => {
    setHasStarted(true);
    if (voice.isMuted) voice.toggleMute();
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hey, I'm here. What's up?" }),
      });
      if (res.ok && (res.headers.get("content-type") || "").includes("audio")) {
        const url = URL.createObjectURL(await res.blob());
        const a = new Audio(url);
        a.onended = () => URL.revokeObjectURL(url);
        await a.play().catch(() => {});
      }
    } catch { /* best-effort greeting */ }
    if (!voice.isListening && !voice.isSpeaking && !isLoading) {
      voice.startListening();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); router.push("/"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  useEffect(() => {
    return () => {
      if (voice.isLiveMode) voice.toggleLiveMode();
      voice.stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orbState: OrbState = voice.isSpeaking
    ? "speaking"
    : isLoading
    ? "thinking"
    : voice.isListening
    ? "listening"
    : "idle";

  const recent = useMemo(() => messages.slice(-4), [messages]);
  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages]
  );

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center select-none overflow-hidden"
      style={{ background: "#111111" }}
    >
      {/* Radial ambient glow behind orb */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            orbState === "speaking"
              ? "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(16,185,129,0.07) 0%, transparent 70%)"
              : orbState === "thinking"
              ? "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(251,191,36,0.06) 0%, transparent 70%)"
              : "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(59,130,246,0.06) 0%, transparent 70%)",
          transition: "background 1s ease",
        }}
      />

      {/* Top nav */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 pt-5 z-20">
        <Link
          href="/"
          className="text-sm text-white/30 hover:text-white/70 transition-colors"
        >
          ← Back
        </Link>
        {!speechSupported && (
          <span className="text-xs text-red-400/80">
            Speech not supported — use Chrome or Edge
          </span>
        )}
        <button
          onClick={voice.toggleMute}
          className="text-sm text-white/30 hover:text-white/70 transition-colors"
        >
          {voice.isMuted ? "Unmute" : "Mute"}
        </button>
      </div>

      {/* Main center column */}
      <div className="relative z-10 flex flex-col items-center gap-8">

        {/* Last assistant message */}
        <div className="h-20 flex items-end justify-center w-[min(520px,85vw)]">
          {lastAssistant && (
            <p
              className="text-center text-white/80 text-base font-light leading-relaxed"
              style={{ fontFamily: "inherit" }}
            >
              {lastAssistant.content}
            </p>
          )}
        </div>

        {/* Orb — click to start */}
        <div
          className="relative cursor-pointer"
          onClick={!hasStarted ? handleStart : undefined}
        >
          <VoiceOrb state={voice.isMuted ? "idle" : orbState} size={220} />

          {/* Pre-start overlay */}
          {!hasStarted && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full">
              <span className="text-white/60 text-sm font-light tracking-widest uppercase">
                Tap to start
              </span>
            </div>
          )}
        </div>

        {/* Status label + interim transcript */}
        <div className="flex flex-col items-center gap-2 h-12">
          {voice.interimTranscript ? (
            <p className="text-white/40 text-sm italic text-center max-w-sm truncate">
              {voice.interimTranscript}
            </p>
          ) : STATE_LABELS[orbState] ? (
            <p className="text-white/30 text-xs uppercase tracking-[0.3em]">
              {STATE_LABELS[orbState]}
            </p>
          ) : null}

          {voice.error && (
            <p className="text-red-400/70 text-xs text-center max-w-sm">
              {voice.error}
            </p>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-white/15 text-xs tracking-widest uppercase">
        press esc to close
      </div>
    </div>
  );
}
