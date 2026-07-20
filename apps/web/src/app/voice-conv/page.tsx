"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from "@elevenlabs/react";

const NeuralOrb = dynamic(
  () => import("@/components/NeuralOrb").then((m) => ({ default: m.NeuralOrb })),
  { ssr: false }
);

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "";

// Same state→style table as /voice — keep the visual language consistent.
type OrbState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

const STATE_STYLE: Record<
  OrbState,
  { label: string; text: string; halo: string; dot: string; pulse: string }
> = {
  idle:       { label: "Tap to connect",  text: "text-zinc-500",   halo: "ring-zinc-700/30",   dot: "bg-zinc-600",    pulse: "" },
  connecting: { label: "Connecting...",   text: "text-cyan-200",   halo: "ring-cyan-400/30",   dot: "bg-cyan-400",    pulse: "animate-pulse" },
  listening:  { label: "Listening...",    text: "text-cyan-300",   halo: "ring-cyan-400/40",   dot: "bg-cyan-400",    pulse: "animate-pulse" },
  thinking:   { label: "Thinking...",     text: "text-amber-300",  halo: "ring-amber-400/40",  dot: "bg-amber-400",   pulse: "animate-pulse" },
  speaking:   { label: "Speaking...",     text: "text-emerald-300",halo: "ring-emerald-400/40",dot: "bg-emerald-400", pulse: "animate-pulse" },
  error:      { label: "Error",           text: "text-red-400",    halo: "ring-red-500/40",    dot: "bg-red-500",     pulse: "" },
};

function ConversationView() {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Map the SDK's status enum to our orb state. Cast (not annotation) because
  // TS narrows the ternary to 4 of the 6 states and then flags the
  // "thinking"/"speaking" comparisons below as no-overlap — those states are
  // reserved for a future SDK mapping.
  const orbState = (error
    ? "error"
    : status === "connecting"
    ? "connecting"
    : status === "connected" && connected
    ? "listening"
    : "idle") as OrbState;

  const style = STATE_STYLE[orbState];

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      await startSession({
        onConnect: ({ conversationId }) => {
          setConnected(true);
          setConversationId(conversationId);
        },
        onDisconnect: () => {
          setConnected(false);
        },
        onError: (message) => {
          setError(typeof message === "string" ? message : "Unknown error");
          setConnected(false);
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    }
  }, [startSession]);

  const handleDisconnect = useCallback(() => {
    endSession();
    setConnected(false);
  }, [endSession]);

  // Escape → end session
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && connected) {
        e.preventDefault();
        handleDisconnect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connected, handleDisconnect]);

  // Stop session on unmount
  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden flex flex-col items-center justify-center select-none">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Top-left: back link */}
      <Link
        href="/"
        className="absolute top-5 left-6 z-20 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-200 transition-colors"
      >
        <span aria-hidden>←</span>
        <span>back to HUD</span>
      </Link>

      {/* Top-right: status pill + agent id (truncated) */}
      <div className="absolute top-5 right-6 z-20 flex items-center gap-3">
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${style.pulse}`} />
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">
          ConvAI · {status}
        </span>
        {conversationId && (
          <span className="text-[9px] font-mono text-zinc-600">
            #{conversationId.slice(-6)}
          </span>
        )}
      </div>

      {/* Center — orb + state */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div
          className={`relative rounded-full ring-2 ${style.halo} transition-[box-shadow,--tw-ring-color] duration-500`}
          style={{ boxShadow: `0 0 80px -20px currentColor` }}
        >
          <NeuralOrb
            isListening={orbState === "listening"}
            isThinking={orbState === "thinking"}
            isSpeaking={orbState === "speaking"}
            isMuted={false}
            size="hero"
          />

          {/* Connect overlay — only when not connected */}
          {!connected && (
            <button
              onClick={handleConnect}
              disabled={!AGENT_ID || status === "connecting"}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-zinc-200 font-display text-sm tracking-[0.3em] uppercase hover:bg-black/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!AGENT_ID
                ? "agent id missing"
                : status === "connecting"
                ? "Connecting..."
                : "Tap to connect"}
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          <p
            className={`text-base font-display tracking-[0.4em] uppercase ${style.text} ${style.pulse}`}
          >
            {style.label}
          </p>
          {error && (
            <p className="text-[11px] font-mono text-red-400/80 max-w-[480px] text-center">
              {error}
            </p>
          )}
          {!AGENT_ID && (
            <p className="text-[11px] font-mono text-amber-400/80 max-w-[480px] text-center mt-2">
              Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID in apps/web/.env.local
            </p>
          )}
        </div>
      </div>

      {/* Bottom-right: disconnect */}
      {connected && (
        <button
          onClick={handleDisconnect}
          className="absolute bottom-6 right-6 z-20 px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-[11px] font-mono text-red-300 hover:bg-red-500/20 transition-colors"
        >
          End session · esc
        </button>
      )}

      {/* Bottom-left: provider banner */}
      <div className="absolute bottom-6 left-6 z-20 text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-700">
        elevenlabs conv ai · lily · sonnet 4.6 via tunnel
      </div>
    </div>
  );
}

export default function VoiceConvPage() {
  if (!AGENT_ID) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-8">
        <div className="max-w-md text-center font-mono text-sm space-y-3">
          <p className="text-amber-400 uppercase tracking-[0.3em] text-xs">
            agent id missing
          </p>
          <p className="text-zinc-400">
            Add <code className="text-zinc-200">NEXT_PUBLIC_ELEVENLABS_AGENT_ID</code> to{" "}
            <code className="text-zinc-200">apps/web/.env.local</code> and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConversationProvider agentId={AGENT_ID}>
      <ConversationView />
    </ConversationProvider>
  );
}
