"use client";

import { useEffect, useState } from "react";
import { Users, Zap, CheckCircle2 } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { DataWindow } from "./DataWindow";

/* ── Types ────────────────────────────────────────────────── */
interface Agent {
  name: string;
  role: string;
  status: "idle" | "active" | "offline";
  color: string;
  tasksCompleted: number;
  activity: number[]; // last 12 data points
}

/* ── Agent Roster ─────────────────────────────────────────── */
const INITIAL_AGENTS: Agent[] = [
  { name: "NEXUS", role: "Sales & Outreach", status: "active", color: "#a855f7", tasksCompleted: 47, activity: [] },
  { name: "BUILDER", role: "Code & Deploy", status: "idle", color: "#3b82f6", tasksCompleted: 132, activity: [] },
  { name: "CREATOR", role: "Content & Social", status: "active", color: "#ec4899", tasksCompleted: 28, activity: [] },
  { name: "PULSE", role: "Analytics & Data", status: "idle", color: "#22c55e", tasksCompleted: 84, activity: [] },
  { name: "CLAWDY", role: "Ops & Support", status: "idle", color: "#f97316", tasksCompleted: 61, activity: [] },
  { name: "NOVA", role: "DM Outreach", status: "active", color: "#06b6d4", tasksCompleted: 19, activity: [] },
  { name: "LARRY", role: "Content Generator", status: "idle", color: "#eab308", tasksCompleted: 15, activity: [] },
  { name: "JUDGE", role: "Quality Control", status: "idle", color: "#ef4444", tasksCompleted: 93, activity: [] },
];

function genActivity(): number[] {
  return Array.from({ length: 12 }, () => Math.random() * 10);
}

/* ── Animated Counter ─────────────────────────────────────── */
function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    function tick(now: number) {
      const p = Math.min((now - t0) / duration, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{display}</>;
}

/* ── Main Panel ───────────────────────────────────────────── */
export function AgentPanel() {
  const [agents, setAgents] = useState<Agent[]>(() =>
    INITIAL_AGENTS.map((a) => ({ ...a, activity: genActivity() }))
  );

  // Refresh activity sparklines periodically
  useEffect(() => {
    const id = setInterval(() => {
      setAgents((prev) =>
        prev.map((a) => ({
          ...a,
          activity: [...a.activity.slice(1), Math.random() * 10],
          tasksCompleted: a.tasksCompleted + (Math.random() > 0.7 ? 1 : 0),
        }))
      );
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const totalTasks = agents.reduce((s, a) => s + a.tasksCompleted, 0);
  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <DataWindow title="Agent Roster" icon={<Users className="w-4 h-4" />} status="online" compact popoutPath="agent-roster">
      <motion.div
        className="space-y-1.5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Stats bar */}
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#1565C0]/20">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                animate={{ boxShadow: ["0 0 2px #22c55e", "0 0 8px #22c55e", "0 0 2px #22c55e"] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[9px] font-mono text-[#4FC3F7] uppercase">{activeCount} ACTIVE</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono text-[#4FC3F7] uppercase">{agents.length} TOTAL</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#00D4FF]" />
            <span className="text-[10px] font-mono font-bold text-[#E3F2FD] tabular-nums">
              <CountUp value={totalTasks} />
            </span>
            <span className="text-[8px] font-mono text-[#4FC3F7]">TASKS</span>
          </div>
        </div>

        {/* Agent rows */}
        {agents.map((agent, i) => (
          <motion.div
            key={agent.name}
            className="flex items-center gap-2 px-1.5 py-1 rounded bg-[#0a1a2a]/40 border border-[#1565C0]/10 hover:border-[#00A2FF]/30 transition-colors"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.06, duration: 0.35 }}
          >
            {/* Status dot */}
            <div className="relative shrink-0">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} />
              {agent.status === "active" && (
                <motion.div
                  className="absolute inset-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: agent.color }}
                  animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>

            {/* Name + role */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-[#E3F2FD]">{agent.name}</span>
                <motion.span
                  className={`text-[7px] font-mono uppercase px-1 rounded ${
                    agent.status === "active"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : agent.status === "offline"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-[#1565C0]/20 text-[#4FC3F7]"
                  }`}
                  animate={agent.status === "active" ? { opacity: [1, 0.6, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {agent.status}
                </motion.span>
              </div>
              <span className="text-[8px] font-mono text-[#4FC3F7] truncate block">{agent.role}</span>
            </div>

            {/* Activity sparkline */}
            <div className="w-16 h-5 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={agent.activity.map((v) => ({ v }))} margin={{ top: 1, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`ag-${agent.name}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={agent.color} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={agent.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={agent.color}
                    strokeWidth={1}
                    fill={`url(#ag-${agent.name})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Tasks count */}
            <span className="text-[9px] font-mono text-[#4FC3F7] tabular-nums w-6 text-right shrink-0">
              {agent.tasksCompleted}
            </span>

            {/* Dispatch button */}
            <button className="text-[7px] font-mono uppercase px-1.5 py-0.5 border border-[#1565C0]/40 text-[#4FC3F7] hover:text-[#00D4FF] hover:border-[#00D4FF]/50 hover:bg-[#00D4FF]/5 rounded transition-all shrink-0">
              GO
            </button>
          </motion.div>
        ))}

        {/* Dispatch All Button */}
        <motion.button
          className="w-full mt-2 py-1.5 rounded border border-[#00A2FF]/40 bg-[#00A2FF]/5 text-[10px] font-mono uppercase tracking-[0.2em] text-[#00D4FF] hover:bg-[#00A2FF]/15 hover:border-[#00D4FF]/60 hover:text-[#E3F2FD] transition-all"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Zap className="w-3 h-3" />
            <span>DISPATCH ALL AGENTS</span>
          </div>
        </motion.button>
      </motion.div>
    </DataWindow>
  );
}
