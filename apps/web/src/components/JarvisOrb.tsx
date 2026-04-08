"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "muted";

interface FridayOrbProps {
  isListening: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isLoading: boolean;
  /** "compact" for inline above input, "hero" for empty-state centerpiece */
  variant?: "compact" | "hero";
  onClick?: () => void;
}

// ─── State Derivation ───────────────────────────────────────

function deriveOrbState(props: FridayOrbProps): OrbState {
  if (props.isMuted) return "muted";
  if (props.isListening || props.isTranscribing) return "listening";
  if (props.isSpeaking) return "speaking";
  if (props.isLoading) return "thinking";
  return "idle";
}

const STATE_LABELS: Record<OrbState, string> = {
  idle: "FRIDAY ONLINE",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "SPEAKING",
  muted: "MUTED",
};

const STATE_COLORS: Record<OrbState, { core: string; glow: string; ring: string; label: string }> = {
  idle: {
    core: "from-cyan-400/80 to-blue-500/80",
    glow: "shadow-[0_0_30px_rgba(34,211,238,0.3)]",
    ring: "border-cyan-400/20",
    label: "text-cyan-400/70",
  },
  listening: {
    core: "from-blue-400/90 to-cyan-300/90",
    glow: "shadow-[0_0_50px_rgba(59,130,246,0.5)]",
    ring: "border-blue-400/40",
    label: "text-blue-400",
  },
  thinking: {
    core: "from-amber-400/80 to-orange-500/80",
    glow: "shadow-[0_0_40px_rgba(251,191,36,0.4)]",
    ring: "border-amber-400/30",
    label: "text-amber-400/80",
  },
  speaking: {
    core: "from-cyan-300/90 to-blue-400/90",
    glow: "shadow-[0_0_60px_rgba(34,211,238,0.5)]",
    ring: "border-cyan-300/50",
    label: "text-cyan-300",
  },
  muted: {
    core: "from-gray-500/40 to-gray-600/40",
    glow: "shadow-[0_0_10px_rgba(100,100,120,0.2)]",
    ring: "border-gray-600/20",
    label: "text-gray-500/60",
  },
};

// ─── Component ──────────────────────────────────────────────

export function FridayOrb({
  isListening,
  isTranscribing,
  isSpeaking,
  isMuted,
  isLoading,
  variant = "compact",
  onClick,
}: FridayOrbProps) {
  const state = deriveOrbState({
    isListening,
    isTranscribing,
    isSpeaking,
    isMuted,
    isLoading,
  });

  const colors = STATE_COLORS[state];
  const label = STATE_LABELS[state];

  const isHero = variant === "hero";
  const orbSize = isHero ? "w-40 h-40" : "w-16 h-16";
  const ringSize = isHero ? "w-52 h-52" : "w-22 h-22";
  const outerRingSize = isHero ? "w-64 h-64" : "w-28 h-28";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 select-none",
        isHero && "gap-6",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      {/* Orb Container */}
      <div className="relative flex items-center justify-center">
        {/* Outer sonar ring — listening/speaking only */}
        {(state === "listening" || state === "speaking") && (
          <div
            className={cn(
              "absolute rounded-full border",
              outerRingSize,
              colors.ring,
              "jarvis-orb-sonar"
            )}
          />
        )}

        {/* Inner ring — always present (except muted) */}
        {state !== "muted" && (
          <div
            className={cn(
              "absolute rounded-full border",
              ringSize,
              colors.ring,
              state === "thinking" && "jarvis-orb-spin",
              state === "idle" && "jarvis-orb-breathe-ring"
            )}
          />
        )}

        {/* Core orb */}
        <div
          className={cn(
            "relative rounded-full bg-gradient-to-br",
            orbSize,
            colors.core,
            colors.glow,
            "transition-all duration-500 ease-in-out",
            state === "idle" && "jarvis-orb-breathe",
            state === "listening" && "jarvis-orb-pulse-fast",
            state === "thinking" && "jarvis-orb-think",
            state === "speaking" && "jarvis-orb-speak"
          )}
        >
          {/* Inner glow highlight */}
          <div
            className={cn(
              "absolute inset-2 rounded-full",
              "bg-gradient-to-br from-white/20 to-transparent",
              state === "muted" && "opacity-30"
            )}
          />

          {/* Center dot — the "eye" */}
          <div
            className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
              isHero ? "w-3 h-3" : "w-1.5 h-1.5",
              state === "muted" ? "bg-gray-400/40" : "bg-white/80",
              state !== "muted" && "jarvis-orb-center-pulse"
            )}
          />
        </div>

        {/* Orbital particles — thinking state */}
        {state === "thinking" && (
          <>
            <div className={cn("absolute rounded-full bg-amber-400/70", isHero ? "w-2 h-2" : "w-1 h-1", "jarvis-orb-orbit-1")} />
            <div className={cn("absolute rounded-full bg-orange-400/60", isHero ? "w-1.5 h-1.5" : "w-1 h-1", "jarvis-orb-orbit-2")} />
            <div className={cn("absolute rounded-full bg-yellow-300/50", isHero ? "w-1 h-1" : "w-0.5 h-0.5", "jarvis-orb-orbit-3")} />
          </>
        )}

        {/* Speaking waveform rings */}
        {state === "speaking" && (
          <>
            <div className={cn("absolute rounded-full border border-cyan-400/30", isHero ? "w-48 h-48" : "w-20 h-20", "jarvis-orb-wave-1")} />
            <div className={cn("absolute rounded-full border border-cyan-300/20", isHero ? "w-56 h-56" : "w-24 h-24", "jarvis-orb-wave-2")} />
          </>
        )}
      </div>

      {/* State Label */}
      <div className={cn("flex items-center gap-2", isHero ? "mt-2" : "")}>
        {/* Status dot */}
        <div
          className={cn(
            "rounded-full",
            isHero ? "w-1.5 h-1.5" : "w-1 h-1",
            state === "muted" ? "bg-gray-500/50" : state === "thinking" ? "bg-amber-400" : "bg-cyan-400",
            state !== "muted" && "jarvis-orb-center-pulse"
          )}
        />
        <span
          className={cn(
            "font-mono tracking-[0.2em] uppercase",
            isHero ? "text-xs" : "text-[9px]",
            colors.label
          )}
        >
          {label}
        </span>
      </div>

      {/* Hero subtitle */}
      {isHero && (
        <p className="text-sm text-gray-500 font-light tracking-wide">
          Hold <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-xs font-mono">`</kbd> to speak
          &nbsp;&middot;&nbsp;
          <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-xs font-mono">M</kbd> to mute
        </p>
      )}
    </div>
  );
}
