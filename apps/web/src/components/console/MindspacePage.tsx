"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SAMPLE_AGENTS, useDemo } from "@/components/deck/demo";
import type { AgentStatus } from "@/lib/agents";
import { Column, DataTable, Drawer } from "./DataTable";
import { PageHeader } from "./States";
import { useResource } from "./useResource";

interface Card {
  id: string;
  name: string;
  role: string;
  status: string;
  lastTask: string;
  lastSummary: string;
  voiceLabel: string;
  adversarial?: boolean;
}

const ROSTER: Card[] = [
  { id: "jarvis", name: "J.A.R.V.I.S.", role: "Security and money", status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Thomas" },
  { id: "edith", name: "E.D.I.T.H.", role: "Content and creative", status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Jenny" },
  { id: "dume", name: "DUM-E", role: "Builder", status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge William" },
  { id: "u", name: "U", role: "Sales and clients", status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Sonia" },
  { id: "vision", name: "VISION", role: "Coach and planner", status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Christopher" },
  { id: "ultron", name: "ULTRON", role: "Red team", status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Eric", adversarial: true },
];

const SAMPLE_MIND = {
  specialists: ROSTER.map((card) => ({
    ...card,
    lastTask: "SAMPLE · no live task",
    lastSummary: "Sample card. Demo mode does not call the specialists.",
  })),
};

const SAMPLE_FLEET = { agents: SAMPLE_AGENTS as AgentStatus[] };

const COLUMNS: Column<AgentStatus>[] = [
  { key: "name", header: "Agent", sortValue: (row) => row.name, cell: (row) => row.name },
  { key: "kind", header: "Kind", sortValue: (row) => row.kind, cell: (row) => row.kind },
  { key: "state", header: "State", sortValue: (row) => row.state, cell: (row) => row.state },
  { key: "detail", header: "Detail", sortValue: (row) => row.detail, cell: (row) => <span className="line-clamp-2 text-muted">{row.detail}</span> },
];

export function MindspacePage() {
  const router = useRouter();
  const { demo } = useDemo();
  const [note, setNote] = useState("");
  const mind = useResource<{ specialists?: Card[] }>("/api/mindspace", SAMPLE_MIND);
  const fleet = useResource<{ agents?: AgentStatus[]; error?: string }>("/api/agents", SAMPLE_FLEET);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [task, setTask] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");

  useEffect(() => {
    if (!demo) setNote("");
  }, [demo]);

  const byId = new Map((mind.data?.specialists || []).map((card) => [card.id, card]));
  const cards = ROSTER.map((card) => ({ ...card, ...(byId.get(card.id) || {}) }));

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
      <PageHeader
        kicker="Specialists"
        title="Mindspace"
        detail="Friday routes the request. The six stay in their rooms. Ultron can only criticise. Talk opens a draft and does not send it."
      />
      {note && <p className="mb-4 text-sm text-brass">{note}</p>}
      {mind.loading && <p className="mb-4 text-sm text-muted">Reading the specialists…</p>}
      {mind.error && <p className="mb-4 text-sm text-danger">{mind.error}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <li key={card.id} className={`flex min-h-44 flex-col rounded-lg border bg-panel p-4 ${card.adversarial ? "border-danger/40" : "border-line"}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">{card.name}</h2>
              <span className="text-xs uppercase tracking-wide text-muted">{card.status}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{card.role}</p>
            {card.adversarial && <p className="mt-2 text-xs uppercase tracking-wide text-danger">Adversarial · read only</p>}
            <p className="mt-3 text-sm text-ink">{card.lastTask || "No task yet."}</p>
            <p className="mt-1 text-xs text-faint">{card.voiceLabel}</p>
            <button
              type="button"
              className="mt-auto pt-4 text-left text-sm font-medium text-brass"
              onClick={() => {
                if (demo) {
                  setNote("Demo mode does not send. Nothing left this browser.");
                  return;
                }
                router.push(`/talk?prefill=${encodeURIComponent(`${card.name}, `)}`);
              }}
            >
              Talk to
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink">Agent runs</h2>
      <p className="mb-3 text-sm text-muted">The fleet reports status. Friday does not keep a separate run log, so this table is the live roster.</p>
      <DataTable
        rows={fleet.data?.agents || []}
        columns={COLUMNS}
        searchText={(row) => `${row.name} ${row.kind} ${row.state} ${row.detail}`}
        loading={fleet.loading}
        error={fleet.error || fleet.data?.error || ""}
        emptyTitle="No agents"
        emptyDetail="The fleet list came back empty."
        onRow={setAgent}
      />
      {agent && (
        <Drawer title={agent.name} onClose={() => setAgent(null)}>
          <p className="text-sm text-muted">{agent.kind} · {agent.state}</p>
          <p className="mt-3 text-sm text-ink">{agent.detail}</p>
          {/key/i.test(agent.detail) && <p className="mt-3 text-sm text-warn">This agent needs a key before it can run.</p>}
          <label className="mt-4 block text-sm text-muted">
            Task
            <textarea value={task} onChange={(event) => setTask(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-line bg-app p-3 text-sm text-ink outline-none" />
          </label>
          <button
            type="button"
            disabled={!agent.canDispatch || !task.trim()}
            className="mt-3 rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-40"
            onClick={() => {
              if (demo) {
                setDispatchNote("Demo mode does not dispatch. Nothing left this browser.");
                return;
              }
              void fetch("/api/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId: agent.id, task }),
              })
                .then((res) => res.json())
                .then((body: { summary?: string; error?: string }) => setDispatchNote(body.summary || body.error || "Dispatch finished."))
                .catch(() => setDispatchNote("Dispatch could not be sent."));
            }}
          >
            Dispatch
          </button>
          {dispatchNote && <p className="mt-3 text-sm text-brass">{dispatchNote}</p>}
        </Drawer>
      )}
    </div>
  );
}
