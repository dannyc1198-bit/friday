"use client";

import { ReactNode } from "react";
import {
  Activity, Cpu, TrendingUp, Shield, Users, Zap,
  Wifi, WifiOff, AlertTriangle, CheckCircle2
} from "lucide-react";

interface DataWindowProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  status?: "online" | "offline" | "warning" | "loading";
  className?: string;
  compact?: boolean;
}

const statusColors = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  warning: "bg-amber-500",
  loading: "bg-cyan-400 animate-pulse",
};

export function DataWindow({
  title,
  icon,
  children,
  status = "online",
  className = "",
  compact = false,
}: DataWindowProps) {
  return (
    <div className={`hud-window group ${className}`}>
      {/* Top border glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400/70 w-4 h-4">{icon}</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-300/80">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />
          <span className="text-[9px] font-mono text-cyan-600 uppercase">{status}</span>
        </div>
      </div>

      {/* Content */}
      <div className={`${compact ? "p-2" : "p-3"} text-sm`}>
        {children}
      </div>

      {/* Corner brackets */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyan-500/40" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyan-500/40" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyan-500/40" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyan-500/40" />
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
      <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-600">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className={`font-mono font-bold ${small ? "text-sm" : "text-lg"} text-cyan-100`}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-cyan-600">{unit}</span>}
        {change !== undefined && (
          <span
            className={`text-[10px] font-mono ${
              change >= 0 ? "text-emerald-400" : "text-red-400"
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
    cyan: "bg-cyan-400",
    green: "bg-emerald-400",
    red: "bg-red-400",
    amber: "bg-amber-400",
    purple: "bg-purple-400",
    blue: "bg-blue-400",
  };
  return (
    <div className="space-y-0.5">
      {label && (
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-cyan-600 uppercase">{label}</span>
          <span className="text-cyan-400">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-1 bg-cyan-950/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorMap[color] || colorMap.cyan} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
