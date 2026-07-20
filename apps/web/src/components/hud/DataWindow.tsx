"use client";

import { ReactNode } from "react";

interface DataWindowProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  status?: "online" | "offline" | "warning" | "loading";
  className?: string;
  compact?: boolean;
  /** When set, renders an "expand" icon in the header that opens /hud/{popoutPath} in a new tab. */
  popoutPath?: string;
}

const statusConfig = {
  online: { color: "#66ffb2", label: "LIVE" },
  offline: { color: "#ff5252", label: "OFF" },
  warning: { color: "#ffa726", label: "WARN" },
  loading: { color: "#00dcff", label: "SYNC" },
};

export function DataWindow({
  title,
  icon,
  children,
  status = "online",
  className = "",
  compact = false,
  popoutPath,
}: DataWindowProps) {
  const { color, label } = statusConfig[status];

  return (
    <div className={`hud-window hud-brackets group ${className}`}>
      {/* Top edge glow */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[#00b4ff]/30 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(0,180,255,0.05)]">
        <div className="flex items-center gap-2">
          <span className="text-[#00dcff]/50 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
          <span className="text-[9px] font-display font-semibold uppercase tracking-[0.2em] text-[#5a8aaa] group-hover:text-[#e0f0ff] transition-colors duration-300">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {popoutPath && (
            <a
              href={`/hud/${popoutPath}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${title} in new tab`}
              className="text-[#5a8aaa] hover:text-[#00dcff] transition-colors opacity-0 group-hover:opacity-100"
              aria-label={`Pop out ${title}`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
                <path d="M21 14v7H3V3h7" />
              </svg>
            </a>
          )}
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: `0 0 4px ${color}, 0 0 8px ${color}40`,
            }}
          />
          <span className="text-[8px] font-mono tracking-[0.15em]" style={{ color: `${color}80` }}>
            {label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className={`${compact ? "p-2.5" : "p-3"} text-sm`}>
        {children}
      </div>
    </div>
  );
}

// ─── Stat display ──────────────────────────────────────────

interface StatProps {
  label: string;
  value: string | number;
  change?: number;
  unit?: string;
  small?: boolean;
}

export function Stat({ label, value, change, unit, small }: StatProps) {
  return (
    <div className={small ? "flex items-center justify-between" : ""}>
      <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#5a8aaa]">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className={`font-mono font-bold ${small ? "text-sm" : "text-lg"} text-[#e0f0ff]`}>
          {value}
        </span>
        {unit && <span className="text-[9px] text-[#5a8aaa]">{unit}</span>}
        {change !== undefined && (
          <span
            className={`text-[9px] font-mono ${
              change >= 0 ? "text-[#66ffb2]" : "text-[#ff5252]"
            }`}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Mini progress bar ─────────────────────────────────────

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  color?: string;
}

export function ProgressBar({ value, max, label, color = "cyan" }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const colorMap: Record<string, string> = {
    cyan: "#00dcff",
    green: "#66ffb2",
    red: "#ff5252",
    amber: "#ffa726",
    purple: "#a855f7",
    blue: "#00b4ff",
  };
  const c = colorMap[color] || colorMap.cyan;

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-[8px] font-mono">
          <span className="text-[#5a8aaa] uppercase tracking-[0.1em]">{label}</span>
          <span style={{ color: c }}>{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-[3px] bg-[#0a1a2e] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            backgroundColor: c,
            boxShadow: `0 0 8px ${c}40`,
          }}
        />
      </div>
    </div>
  );
}
