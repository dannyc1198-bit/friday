"use client";

import { Users } from "lucide-react";
import { DataWindow } from "./DataWindow";

interface Agent {
  name: string;
  role: string;
  status: "idle" | "active" | "offline";
  color: string;
  lastTask?: string;
}

const AGENTS: Agent[] = [
  { name: "NEXUS", role: "Sales & Outreach", status: "idle", color: "#a855f7" },
  { name: "BUILDER", role: "Code & Deploy", status: "idle", color: "#3b82f6" },
  { name: "CREATOR", role: "Content & Social", status: "idle", color: "#ec4899" },
  { name: "PULSE", role: "Analytics & Data", status: "idle", color: "#22c55e" },
  { name: "CLAWDY", role: "Ops & Support", status: "idle", color: "#f97316" },
];

export function AgentPanel() {
  return (
    <DataWindow
      title="Agent Roster"
      icon={<Users className="w-4 h-4" />}
      status="online"
      compact
    >
      <div className="space-y-1.5">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center gap-2 px-1.5 py-1 rounded bg-cyan-950/20 hover:bg-cyan-900/20 transition-colors"
          >
            {/* Status dot with agent color */}
            <div className="relative">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              {agent.status === "active" && (
                <div
                  className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
                  style={{ backgroundColor: agent.color, opacity: 0.4 }}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-cyan-200">
                  {agent.name}
                </span>
                <span className="text-[8px] font-mono text-cyan-700 uppercase">
                  {agent.status}
                </span>
              </div>
              <span className="text-[9px] font-mono text-cyan-600 truncate block">
                {agent.role}
              </span>
            </div>

            {/* Dispatch button */}
            <button
              className="text-[8px] font-mono uppercase px-1.5 py-0.5 border border-cyan-800/50
                         text-cyan-500 hover:text-cyan-300 hover:border-cyan-500/50 rounded transition-colors"
            >
              dispatch
            </button>
          </div>
        ))}
      </div>
    </DataWindow>
  );
}
