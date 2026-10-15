"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { useAgents } from "@/hooks/useAgents";
import { DataWindow } from "./DataWindow";

function dotColor(state: string): string {
  if (state === "online") return "#22c55e";
  if (state === "degraded") return "#f59e0b";
  return "#ef4444";
}

export function AgentPanel() {
  const { agents, loading, error, dispatchTask } = useAgents();
  const [task, setTask] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const dots = agents.filter((agent) => agent.render === "dot");
  const rows = agents.filter((agent) => agent.render !== "dot");
  const online = agents.filter((agent) => agent.state === "online").length;
  const anyOnline = online > 0;

  async function send(agentId: string) {
    if (!task.trim()) return;
    setNote("routing…");
    const result = await dispatchTask(agentId, task.trim());
    setNote(result.summary || result.error || (result.ok ? "sent" : "failed"));
    if (result.ok) setTask("");
  }

  return (
    <DataWindow
      title="Agent Roster"
      icon={<Users className="w-4 h-4" />}
      status={error ? "offline" : anyOnline ? "online" : "warning"}
      compact
      popoutPath="agent-roster"
    >
      <div className="space-y-1.5">
        <div className="mb-2 flex items-center justify-between border-b border-[#1565C0]/20 pb-1.5">
          <span className="font-mono text-[9px] uppercase text-[#4FC3F7]">{online} ONLINE</span>
          <span className="font-mono text-[9px] uppercase text-[#4FC3F7]">{agents.length} BACKENDS</span>
        </div>

        {error && <p className="font-mono text-[10px] text-red-300">{error}</p>}

        {dots.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 py-1">
            {dots.map((agent) => (
              <button
                key={agent.id}
                type="button"
                title={agent.detail}
                onClick={() => setTarget(agent.id)}
                className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                  target === agent.id ? "border-[#00D4FF]/60 text-[#E3F2FD]" : "border-[#1565C0]/30 text-[#4FC3F7]"
                }`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor(agent.state) }} />
                {agent.name}
              </button>
            ))}
          </div>
        )}

        {rows.map((agent) => (
          <div
            key={agent.id}
            className={`flex items-center gap-2 rounded border px-1.5 py-1 ${
              target === agent.id ? "border-[#00D4FF]/40 bg-[#00A2FF]/5" : "border-[#1565C0]/10 bg-[#0a1a2a]/40"
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor(agent.state) }} />
            <button type="button" onClick={() => setTarget(agent.id)} className="min-w-0 flex-1 text-left">
              <span className="block font-mono text-[10px] font-bold text-[#E3F2FD]">{agent.name}</span>
              <span className="block truncate font-mono text-[8px] text-[#4FC3F7]" title={agent.detail}>
                {agent.state} — {agent.detail}
              </span>
            </button>
            <button
              type="button"
              disabled={!agent.canDispatch || !task.trim() || loading}
              onClick={() => send(agent.id)}
              className="shrink-0 rounded border border-[#1565C0]/40 px-1.5 py-0.5 font-mono text-[7px] uppercase text-[#4FC3F7] disabled:opacity-40"
            >
              GO
            </button>
          </div>
        ))}

        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          rows={2}
          placeholder="Task for the selected backend"
          className="mt-1 w-full resize-none rounded border border-[#1565C0]/30 bg-transparent px-2 py-1 font-mono text-[10px] text-[#E3F2FD] placeholder:text-[#4FC3F7]/40 focus:outline-none"
        />
        {note && <p className="font-mono text-[9px] leading-relaxed text-[#4FC3F7]">{note}</p>}
      </div>
    </DataWindow>
  );
}
