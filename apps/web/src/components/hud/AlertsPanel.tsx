"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, AlertTriangle, Info, Zap, Shield, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DataWindow } from "./DataWindow";

/* ── Types ────────────────────────────────────────────────── */
interface Alert {
  id: string;
  type: "info" | "warning" | "critical" | "success";
  message: string;
  timestamp: number; // ms epoch
  read?: boolean;
}

/* ── Time ago (updates live) ──────────────────────────────── */
function TimeAgo({ timestamp }: { timestamp: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    function update() {
      const sec = Math.floor((Date.now() - timestamp) / 1000);
      if (sec < 5) setText("now");
      else if (sec < 60) setText(`${sec}s`);
      else if (sec < 3600) setText(`${Math.floor(sec / 60)}m`);
      else setText(`${Math.floor(sec / 3600)}h`);
    }
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, [timestamp]);
  return <span className="text-[8px] font-mono text-[#4FC3F7] tabular-nums shrink-0">{text}</span>;
}

/* ── Icon + Color Maps ────────────────────────────────────── */
const iconMap = {
  info: <Info className="w-3 h-3 text-[#00D4FF]" />,
  warning: <AlertTriangle className="w-3 h-3 text-amber-400" />,
  critical: <Zap className="w-3 h-3 text-red-400" />,
  success: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
};

const borderColor = {
  info: "#00D4FF40",
  warning: "#f59e0b40",
  critical: "#ef444460",
  success: "#22c55e40",
};

const bgFlash = {
  info: "#00D4FF08",
  warning: "#f59e0b08",
  critical: "#ef444410",
  success: "#22c55e08",
};

/* ── Default Alerts ───────────────────────────────────────── */
const DEFAULT_ALERTS: Alert[] = [
  { id: "boot-1", type: "success", message: "FRIDAY online. All systems nominal.", timestamp: Date.now() - 2000 },
  { id: "boot-2", type: "success", message: "Gemini 2.5 Flash brain connected.", timestamp: Date.now() - 30000 },
  { id: "boot-3", type: "success", message: "Lily voice (ElevenLabs) ready.", timestamp: Date.now() - 60000 },
  { id: "boot-4", type: "info", message: "Sidecar vision feed live on :3002.", timestamp: Date.now() - 120000 },
  { id: "boot-5", type: "info", message: "50 tools registered, ready to dispatch.", timestamp: Date.now() - 300000 },
];

/* ── Simulated new alerts ─────────────────────────────────── */
const INCOMING = [
  { type: "info" as const, message: "NOVA dispatched 2 new DMs." },
  { type: "success" as const, message: "PULSE scan complete. No anomalies." },
  { type: "warning" as const, message: "API rate limit at 78%." },
  { type: "info" as const, message: "BUILDER pushed commit to jarvis/web." },
  { type: "critical" as const, message: "Sidecar heartbeat missed. Reconnecting..." },
  { type: "success" as const, message: "Sidecar reconnected. Latency: 12ms." },
  { type: "info" as const, message: "Market alert: XRP up 4.2% in 1h." },
];

/* ── Priority → Alert type mapping ────────────────────────── */
const priorityToType: Record<string, Alert["type"]> = {
  high: "critical",
  medium: "warning",
  low: "info",
};

/* ── Main Panel ───────────────────────────────────────────── */
export function AlertsPanel({ alerts: propAlerts }: { alerts?: Alert[] }) {
  const [alerts, setAlerts] = useState<Alert[]>(propAlerts || DEFAULT_ALERTS);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<string>());

  // Poll real proactive alerts from orchestrator
  useEffect(() => {
    async function pollAlerts() {
      try {
        const res = await fetch("http://localhost:3001/api/proactive/alerts");
        if (!res.ok) return;
        const data = await res.json();
        const realAlerts: Array<{ id: string; message: string; priority: string; type?: string; timestamp?: string }> = data.alerts || [];

        let newCount = 0;
        const mapped: Alert[] = realAlerts.map((a) => {
          if (!seenIds.current.has(a.id)) {
            seenIds.current.add(a.id);
            newCount++;
          }
          return {
            id: a.id,
            type: priorityToType[a.priority] || "info",
            message: a.message,
            timestamp: a.timestamp ? new Date(a.timestamp).getTime() : Date.now(),
          };
        });

        if (mapped.length > 0) {
          setAlerts((prev) => {
            // Merge new alerts at top, dedup by id
            const ids = new Set(mapped.map((a) => a.id));
            const kept = prev.filter((p) => !ids.has(p.id));
            return [...mapped, ...kept].slice(0, 25);
          });
          if (newCount > 0) setUnread((u) => u + newCount);
        }
      } catch { /* orchestrator offline — keep existing alerts */ }
    }

    pollAlerts();
    const id = setInterval(pollAlerts, 15_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to top on new alert
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [alerts.length]);

  return (
    <DataWindow title="Activity Feed" icon={<Bell className="w-4 h-4" />} status="online" compact popoutPath="activity-feed">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#1565C0]/20">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-[#4FC3F7] uppercase">{alerts.length} EVENTS</span>
          </div>
          {unread > 0 && (
            <motion.div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30"
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              onClick={() => setUnread(0)}
            >
              <span className="text-[9px] font-mono font-bold text-[#00D4FF] tabular-nums">{unread}</span>
              <span className="text-[7px] font-mono text-[#4FC3F7] uppercase">NEW</span>
            </motion.div>
          )}
        </div>

        {/* Scrollable list */}
        <div ref={scrollRef} className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-[#1565C0]/30">
          <AnimatePresence initial={false}>
            {alerts.slice(0, 12).map((alert, i) => (
              <motion.div
                key={alert.id}
                layout
                initial={{ opacity: 0, x: 20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="flex items-start gap-2 px-2 py-1.5 rounded-sm border-l-2 overflow-hidden"
                style={{
                  backgroundColor: bgFlash[alert.type],
                  borderLeftColor: borderColor[alert.type],
                }}
              >
                <span className="mt-0.5 shrink-0">{iconMap[alert.type]}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono text-[#E3F2FD] block leading-tight">
                    {alert.message}
                  </span>
                </div>
                <TimeAgo timestamp={alert.timestamp} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </DataWindow>
  );
}
