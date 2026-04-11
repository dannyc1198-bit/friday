"use client";

import { useEffect, useState, useRef } from "react";
import { Wifi, WifiOff, Globe, ArrowUpRight, ArrowDownRight, Radio } from "lucide-react";
import { motion } from "framer-motion";
import { DataWindow } from "./DataWindow";

/* ── Animated Counter ─────────────────────────────────────── */
function AnimCount({ value, decimals = 0, duration = 1000 }: { value: number; decimals?: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const start = ref.current;
    const diff = value - start;
    const t0 = performance.now();
    function tick(now: number) {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + diff * eased);
      if (p < 1) requestAnimationFrame(tick);
      else ref.current = value;
    }
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{display.toFixed(decimals)}</>;
}

/* ── Connection Entry ─────────────────────────────────────── */
interface ServiceConnection {
  name: string;
  endpoint: string;
  status: "connected" | "degraded" | "offline";
  latency: number;
}

function ConnectionRow({ svc, index }: { svc: ServiceConnection; index: number }) {
  const dotColor = svc.status === "connected" ? "#22c55e" : svc.status === "degraded" ? "#f59e0b" : "#ef4444";
  const latencyColor = svc.latency < 100 ? "#22c55e" : svc.latency < 300 ? "#f59e0b" : "#ef4444";

  return (
    <motion.div
      className="flex items-center gap-2 px-2 py-1 rounded bg-[#0a1a2a]/40 border border-[#1565C0]/10 hover:border-[#00A2FF]/20 transition-colors"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 + index * 0.06, duration: 0.35 }}
    >
      {/* Status dot */}
      <motion.div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: dotColor }}
        animate={svc.status === "connected" ? {
          boxShadow: [`0 0 2px ${dotColor}`, `0 0 6px ${dotColor}`, `0 0 2px ${dotColor}`],
        } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-mono font-bold text-[#E3F2FD] block">{svc.name}</span>
        <span className="text-[7px] font-mono text-[#4FC3F7] truncate block">{svc.endpoint}</span>
      </div>

      {/* Latency */}
      <span className="text-[9px] font-mono tabular-nums shrink-0" style={{ color: latencyColor }}>
        {svc.status === "offline" ? "---" : `${svc.latency}ms`}
      </span>
    </motion.div>
  );
}

/* ── Futuristic Toggle ────────────────────────────────────── */
function OfflineToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded border transition-all"
      style={{
        borderColor: enabled ? "#ef444460" : "#1565C030",
        backgroundColor: enabled ? "#ef444410" : "#0a1a2a40",
      }}
    >
      <div className="relative w-8 h-4 rounded-full overflow-hidden" style={{ backgroundColor: enabled ? "#ef444430" : "#0a2a3a" }}>
        <motion.div
          className="absolute top-0.5 w-3 h-3 rounded-full"
          style={{ backgroundColor: enabled ? "#ef4444" : "#4FC3F7" }}
          animate={{ left: enabled ? 16 : 2 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        />
      </div>
      <span className={`text-[8px] font-mono uppercase tracking-[0.15em] ${enabled ? "text-red-400" : "text-[#4FC3F7]"}`}>
        {enabled ? "OFFLINE MODE ACTIVE" : "OFFLINE MODE"}
      </span>
      {enabled && (
        <WifiOff className="w-3 h-3 text-red-400 ml-auto" />
      )}
    </button>
  );
}

/* ── Main Panel ───────────────────────────────────────────── */
export function NetworkPanel() {
  const [connections, setConnections] = useState<ServiceConnection[]>([
    { name: "ANTHROPIC", endpoint: "api.anthropic.com", status: "connected", latency: 45 },
    { name: "ELEVENLABS", endpoint: "api.elevenlabs.io", status: "degraded", latency: 180 },
    { name: "COINGECKO", endpoint: "api.coingecko.com", status: "connected", latency: 62 },
    { name: "NOTION", endpoint: "api.notion.com", status: "connected", latency: 88 },
    { name: "TAVILY", endpoint: "api.tavily.com", status: "connected", latency: 120 },
    { name: "GITHUB", endpoint: "api.github.com", status: "connected", latency: 38 },
    { name: "SUPABASE", endpoint: "*.supabase.co", status: "offline", latency: 0 },
  ]);

  const [bytesSent, setBytesSent] = useState(0);
  const [bytesRecv, setBytesRecv] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);

  // Simulate latency jitter and byte counters
  useEffect(() => {
    const id = setInterval(() => {
      setConnections((prev) =>
        prev.map((c) => ({
          ...c,
          latency: c.status === "offline" ? 0 : Math.max(10, c.latency + Math.floor((Math.random() - 0.5) * 30)),
        }))
      );
      setBytesSent((b) => b + Math.floor(Math.random() * 15000));
      setBytesRecv((b) => b + Math.floor(Math.random() * 48000));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const formatBytes = (b: number) => {
    if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
    return `${b} B`;
  };

  const onlineCount = connections.filter((c) => c.status === "connected").length;
  const totalCount = connections.length;

  return (
    <DataWindow title="Network" icon={<Globe className="w-4 h-4" />} status={offlineMode ? "offline" : "online"} compact>
      <motion.div
        className="space-y-2.5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Header stats */}
        <div className="flex items-center justify-between pb-1.5 border-b border-[#1565C0]/20">
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: offlineMode ? "#ef4444" : "#22c55e" }}
              animate={offlineMode ? {} : { boxShadow: ["0 0 2px #22c55e", "0 0 6px #22c55e", "0 0 2px #22c55e"] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[9px] font-mono text-[#4FC3F7] uppercase">
              {onlineCount}/{totalCount} CONNECTED
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <ArrowUpRight className="w-2.5 h-2.5 text-emerald-400" />
              <span className="text-[8px] font-mono text-emerald-400 tabular-nums">{formatBytes(bytesSent)}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <ArrowDownRight className="w-2.5 h-2.5 text-[#00D4FF]" />
              <span className="text-[8px] font-mono text-[#00D4FF] tabular-nums">{formatBytes(bytesRecv)}</span>
            </div>
          </div>
        </div>

        {/* Connection list */}
        <div className="space-y-1 max-h-44 overflow-y-auto scrollbar-thin scrollbar-thumb-[#1565C0]/30">
          {connections.map((svc, i) => (
            <ConnectionRow key={svc.name} svc={svc} index={i} />
          ))}
        </div>

        {/* Bytes sent/received detail */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1565C0]/20">
          <motion.div
            className="rounded bg-[#0a1a2a]/60 px-2 py-1.5 border border-[#1565C0]/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <span className="text-[7px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] block">SENT</span>
            <span className="text-[11px] font-mono font-bold text-emerald-400 tabular-nums">{formatBytes(bytesSent)}</span>
          </motion.div>
          <motion.div
            className="rounded bg-[#0a1a2a]/60 px-2 py-1.5 border border-[#1565C0]/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <span className="text-[7px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] block">RECEIVED</span>
            <span className="text-[11px] font-mono font-bold text-[#00D4FF] tabular-nums">{formatBytes(bytesRecv)}</span>
          </motion.div>
        </div>

        {/* Offline Mode Toggle */}
        <OfflineToggle enabled={offlineMode} onToggle={() => setOfflineMode((o) => !o)} />
      </motion.div>
    </DataWindow>
  );
}
