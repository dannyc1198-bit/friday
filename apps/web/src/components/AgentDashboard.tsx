"use client";

import { useState } from "react";

interface Agent {
  id: string;
  name: string;
  specialty: string;
  autonomyLevel: string;
  capabilities: string[];
}

interface AgentTask {
  id: string;
  agentId: string;
  task: string;
  status: string;
}

interface AgentDashboardProps {
  agents: Agent[];
  tasks: AgentTask[];
  loading: boolean;
  onDispatch: (agentId: string, task: string) => void;
}

const AGENT_COLORS: Record<string, string> = {
  nexus: "border-purple-500/50 bg-purple-500/5",
  builder: "border-blue-500/50 bg-blue-500/5",
  creator: "border-pink-500/50 bg-pink-500/5",
  pulse: "border-green-500/50 bg-green-500/5",
  clawdy: "border-orange-500/50 bg-orange-500/5",
};

const AGENT_TEXT_COLORS: Record<string, string> = {
  nexus: "text-purple-400",
  builder: "text-blue-400",
  creator: "text-pink-400",
  pulse: "text-green-400",
  clawdy: "text-orange-400",
};

export function AgentDashboard({ agents, tasks, loading, onDispatch }: AgentDashboardProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState("");

  const handleDispatch = (agentId: string) => {
    if (!taskInput.trim()) return;
    onDispatch(agentId, taskInput);
    setTaskInput("");
    setExpandedAgent(null);
  };

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50">
      <div className="px-3 py-2 border-b border-gray-700/50 flex items-center justify-between">
        <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Agents (OpenClaw)</span>
        {tasks.length > 0 && (
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
            {tasks.length} active
          </span>
        )}
      </div>

      <div className="p-2 space-y-1.5">
        {agents.map((agent) => {
          const agentTasks = tasks.filter((t) => t.agentId === agent.id);
          const isExpanded = expandedAgent === agent.id;

          return (
            <div
              key={agent.id}
              className={`rounded border p-2 cursor-pointer transition-colors ${AGENT_COLORS[agent.id] || "border-gray-700"}`}
              onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-xs font-bold ${AGENT_TEXT_COLORS[agent.id] || "text-gray-300"}`}>
                    {agent.name}
                  </span>
                  <span className="text-[10px] text-gray-500 ml-2">{agent.specialty}</span>
                </div>
                <div className="flex items-center gap-1">
                  {agentTasks.length > 0 && (
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1 rounded">
                      {agentTasks.length}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-600">{agent.autonomyLevel}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[10px] text-gray-500">
                    {agent.capabilities.join(" | ")}
                  </div>

                  {/* Task input */}
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleDispatch(agent.id)}
                      placeholder={`Task for ${agent.name}...`}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                    />
                    <button
                      onClick={() => handleDispatch(agent.id)}
                      disabled={loading || !taskInput.trim()}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded text-[10px] text-white font-bold transition-colors"
                    >
                      GO
                    </button>
                  </div>

                  {/* Active tasks */}
                  {agentTasks.map((t) => (
                    <div key={t.id} className="text-[10px] text-gray-400 bg-gray-800/50 rounded px-2 py-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                        t.status === "completed" ? "bg-green-400" :
                        t.status === "running" ? "bg-yellow-400 animate-pulse" :
                        "bg-gray-400"
                      }`} />
                      {t.task.slice(0, 60)}{t.task.length > 60 ? "..." : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
