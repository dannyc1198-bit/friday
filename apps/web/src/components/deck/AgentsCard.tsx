"use client";

import { useState } from "react";
import { useAgents } from "@/hooks/useAgents";
import { Dot, OfflineNote, Panel } from "./deck-lib";
import { SAMPLE_AGENTS, useDemo } from "./demo";

function tone(state: string): "ok" | "alert" | "amber" | "dim" {
  if (state === "online") return "ok";
  if (state === "degraded") return "amber";
  if (state === "offline") return "alert";
  return "dim";
}

export function AgentsCard() {
  const { demo } = useDemo();
  const { agents, loading, error, dispatchTask } = useAgents();
  const [task, setTask] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const shown = demo ? SAMPLE_AGENTS : agents;

  const dots = shown.filter((agent) => agent.render === "dot");
  const rows = shown.filter((agent) => agent.render !== "dot");
  const selected = shown.find((agent) => agent.id === target);

  async function send() {
    if (demo) {
      setNote("Demo mode does not dispatch. Nothing was sent.");
      return;
    }
    if (!selected || !task.trim() || !selected.canDispatch) return;
    setNote("routing…");
    const result = await dispatchTask(selected.id, task.trim());
    setNote(result.summary || result.error || (result.ok ? "sent" : "failed"));
    if (result.ok) setTask("");
  }

  return (
    <Panel
      title="Agents"
      right={
        <span className="font-deckmono text-[10px] text-deck-faint">
          {demo ? "SAMPLE" : `${agents.filter((agent) => agent.state === "online").length} up`}
        </span>
      }
    >
      {!demo && error && <OfflineNote text={error} />}
      {!demo && !error && agents.length === 0 && <OfflineNote text="Waiting for the orchestrator…" />}

      {dots.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-deckmono text-[9px] uppercase tracking-wider text-deck-faint">Grok bots</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {dots.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  title={agent.detail}
                  onClick={() => setTarget(agent.id)}
                  className={`flex items-center gap-1.5 font-deckmono text-[10px] ${
                    target === agent.id ? "text-deck-ink" : "text-deck-dim"
                  }`}
                >
                  <Dot tone={tone(agent.state)} />
                  {agent.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1.5">
        {rows.map((agent) => (
          <li key={agent.id}>
            <button
              type="button"
              onClick={() => setTarget(agent.id)}
              className={`flex w-full items-start gap-2 text-left font-deckmono text-[11px] ${
                target === agent.id ? "text-deck-ink" : "text-deck-dim"
              }`}
            >
              <span className="mt-1"><Dot tone={tone(agent.state)} /></span>
              <span className="min-w-0">
                <span className="block text-deck-ink">{agent.name}</span>
                <span className="block truncate text-[10px] text-deck-faint" title={agent.detail}>
                  {agent.state} — {agent.detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 space-y-1.5">
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          rows={2}
          placeholder={selected ? `Task for ${selected.name}` : "Select a backend"}
          className="w-full resize-none rounded border border-deck-line bg-transparent px-2 py-1 font-deckmono text-[11px] text-deck-ink placeholder:text-deck-faint focus:border-deck-line-bright focus:outline-none"
        />
        <button
          type="button"
          disabled={(!demo && (!selected?.canDispatch || !task.trim())) || loading}
          onClick={send}
          className="w-full rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim enabled:hover:border-deck-line-bright enabled:hover:text-deck-ink disabled:opacity-40"
        >
          {loading ? "Routing" : "Route task"}
        </button>
        {note && <p className="font-deckmono text-[10px] leading-relaxed text-deck-dim">{note}</p>}
      </div>
    </Panel>
  );
}
