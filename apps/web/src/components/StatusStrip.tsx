"use client";

// Honest system readout for the header — every value is live from
// /api/health (which now actually asks the orchestrator). No decorative dots.

import { ConnectionStatus, HealthResponse } from "@/types";
import { cn } from "@/lib/utils";

interface StatusStripProps {
  status: ConnectionStatus;
  health: HealthResponse | null;
}

function Reading({ label, value, tone = "dim" }: { label: string; value: string; tone?: "dim" | "ok" | "warn" | "bad" }) {
  return (
    <div className="hidden md:flex items-center gap-1.5">
      <span className="font-mono text-[7px] tracking-[0.2em] uppercase text-[#1e3a50]">{label}</span>
      <span className={cn(
        "font-mono text-[8px] tracking-[0.1em] uppercase",
        tone === "ok" && "text-[#66ffb2]/80",
        tone === "warn" && "text-[#ffa726]/80",
        tone === "bad" && "text-[#ff5252]/80",
        tone === "dim" && "text-[#5a8aaa]"
      )}>
        {value}
      </span>
    </div>
  );
}

export function StatusStrip({ status, health }: StatusStripProps) {
  const connected = status === "connected";
  return (
    <div className="flex items-center gap-4">
      {health?.llm && (
        <Reading label="CORE" value={`${health.llm.provider} · ${health.llm.model.replace(/-(latest|versatile)$/, "")}`} tone={health.llm.configured ? "dim" : "bad"} />
      )}
      {typeof health?.tools === "number" && (
        <Reading label="TOOLS" value={String(health.tools)} tone="dim" />
      )}
      {typeof health?.tts === "boolean" && (
        <Reading label="VOICE" value={health.tts ? "11LABS" : "BROWSER"} tone={health.tts ? "ok" : "warn"} />
      )}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            connected && "bg-[#66ffb2] status-dot-glow",
            status === "disconnected" && "bg-[#ff5252] status-dot-glow",
            status === "checking" && "bg-[#ffa726] animate-pulse"
          )}
          style={{ color: connected ? "#66ffb2" : status === "disconnected" ? "#ff5252" : "#ffa726" }}
        />
        <span className={cn(
          "font-mono text-[8px] tracking-[0.2em] uppercase",
          connected ? "text-[#66ffb2]/80" : status === "disconnected" ? "text-[#ff5252]/80" : "text-[#ffa726]/80"
        )}>
          {connected ? "Online" : status === "disconnected" ? "Core down" : "Linking"}
        </span>
      </div>
    </div>
  );
}
