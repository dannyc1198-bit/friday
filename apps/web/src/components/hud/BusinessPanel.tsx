"use client";

import { useEffect, useState, useRef } from "react";
import { BarChart3, Target, TrendingUp, Users, DollarSign, Zap } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Cell } from "recharts";
import { motion } from "framer-motion";
import { DataWindow } from "./DataWindow";

/* ── Animated Counter ─────────────────────────────────────── */
function AnimCount({ value, prefix = "", suffix = "", decimals = 0, duration = 1400 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number;
}) {
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

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toString();
  return <>{prefix}{formatted}{suffix}</>;
}

/* ── Circular Gauge (Daily Target) ────────────────────────── */
function DailyGauge({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, (current / target) * 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 100 ? "#22c55e" : pct >= 50 ? "#00D4FF" : "#f59e0b";

  return (
    <div className="flex flex-col items-center">
      <svg width={88} height={88} viewBox="0 0 88 88">
        {/* Track */}
        <circle cx={44} cy={44} r={r} fill="none" stroke="#0a2a3a" strokeWidth={5} />
        {/* Value */}
        <motion.circle
          cx={44} cy={44} r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 2, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}60)`, transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
        {/* Center text */}
        <text x={44} y={38} textAnchor="middle" className="font-mono font-bold" fill="#E3F2FD" fontSize={16}>
          ${current}
        </text>
        <text x={44} y={52} textAnchor="middle" className="font-mono" fill="#4FC3F7" fontSize={9}>
          / ${target}
        </text>
        <text x={44} y={64} textAnchor="middle" className="font-mono" fill={color} fontSize={10}>
          {pct.toFixed(0)}%
        </text>
      </svg>
      <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] mt-1">DAILY TARGET</span>
    </div>
  );
}

/* ── Conversion Funnel ────────────────────────────────────── */
function Funnel({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const max = stages[0]?.value || 1;
  return (
    <div className="space-y-1">
      <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] block">CONVERSION FUNNEL</span>
      {stages.map((s, i) => {
        const widthPct = Math.max(20, (s.value / max) * 100);
        return (
          <motion.div
            key={s.label}
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.0 + i * 0.15, duration: 0.4 }}
          >
            <span className="text-[8px] font-mono text-[#4FC3F7] w-16 text-right uppercase">{s.label}</span>
            <div className="flex-1 h-3 bg-[#0a2a3a] rounded overflow-hidden">
              <motion.div
                className="h-full rounded"
                style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}40` }}
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 1.0 + i * 0.15 }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-[#E3F2FD] w-6 text-right">{s.value}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Weekly Data ──────────────────────────────────────────── */
const weekData = [
  { day: "M", rev: 0 },
  { day: "T", rev: 45 },
  { day: "W", rev: 120 },
  { day: "T", rev: 0 },
  { day: "F", rev: 200 },
  { day: "S", rev: 0 },
  { day: "S", rev: 0 },
];

/* ── Main Panel ───────────────────────────────────────────── */
export function BusinessPanel() {
  const [mrr, setMrr] = useState(0);
  const [leads, setLeads] = useState(0);
  const [pipeline, setPipeline] = useState(0);
  const [dailyRev, setDailyRev] = useState(0);
  const [closedClients, setClosedClients] = useState(0);
  const [newLead, setNewLead] = useState(false);
  const prevLeads = useRef(0);

  // Fetch real business metrics from orchestrator
  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("http://localhost:3001/api/tools/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "business_get_metrics", parameters: {} }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const m = data.result || data;
        if (m.mrr !== undefined) setMrr(m.mrr);
        if (m.dailyEquivalent !== undefined) setDailyRev(m.dailyEquivalent);
        if (m.activeLeads !== undefined) {
          if (m.activeLeads > prevLeads.current && prevLeads.current > 0) {
            setNewLead(true);
            setTimeout(() => setNewLead(false), 2000);
          }
          prevLeads.current = m.activeLeads;
          setLeads(m.activeLeads);
        }
        if (m.pipelineValue !== undefined) setPipeline(m.pipelineValue);
        if (m.closedClients !== undefined) setClosedClients(m.closedClients);
      } catch { /* orchestrator offline — keep current values */ }
    }
    fetchMetrics();
    const id = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <DataWindow title="Revenue Intel" icon={<BarChart3 className="w-4 h-4" />} status="online" compact popoutPath="revenue-intel">
      <motion.div
        className="space-y-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Top: Gauge + Metrics */}
        <div className="flex items-start gap-3">
          <DailyGauge current={dailyRev} target={500} />

          <div className="flex-1 space-y-2 pt-1">
            {/* MRR */}
            <motion.div
              className="rounded bg-[#0a1a2a]/60 px-2 py-1.5 border border-[#1565C0]/20"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] block">MRR</span>
              <span className="text-lg font-mono font-bold text-[#E3F2FD]">
                <AnimCount value={mrr} prefix="$" />
              </span>
            </motion.div>

            {/* Leads */}
            <motion.div
              className={`rounded px-2 py-1.5 border transition-colors duration-500 ${
                newLead ? "bg-[#00D4FF]/10 border-[#00D4FF]/40" : "bg-[#0a1a2a]/60 border-[#1565C0]/20"
              }`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.45, duration: 0.4 }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7]">LEADS</span>
                {newLead && (
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-[#00D4FF]"
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 0.6, repeat: 2 }}
                  />
                )}
              </div>
              <span className="text-lg font-mono font-bold text-[#E3F2FD]">
                <AnimCount value={leads} />
              </span>
            </motion.div>

            {/* Pipeline */}
            <motion.div
              className="rounded bg-[#0a1a2a]/60 px-2 py-1.5 border border-[#1565C0]/20"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] block">PIPELINE</span>
              <span className="text-lg font-mono font-bold text-[#E3F2FD]">
                $<AnimCount value={pipeline / 1000} decimals={1} suffix="K" />
              </span>
            </motion.div>
          </div>
        </div>

        {/* Weekly Revenue Chart */}
        <div>
          <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] block mb-1">THIS WEEK</span>
          <div className="h-14 rounded bg-[#0a1a2a]/40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData} barSize={10} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <Bar dataKey="rev" radius={[2, 2, 0, 0]}>
                  {weekData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.rev > 0 ? "#00A2FF" : "#0a2a3a"}
                      fillOpacity={entry.rev > 0 ? 0.9 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Funnel */}
        <Funnel
          stages={[
            { label: "LEADS", value: 21, color: "#00D4FF" },
            { label: "CONTACTED", value: 5, color: "#00A2FF" },
            { label: "MEETING", value: 2, color: "#1565C0" },
            { label: "CLOSED", value: 0, color: "#22c55e" },
          ]}
        />
      </motion.div>
    </DataWindow>
  );
}
