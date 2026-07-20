"use client";

import { Panel, usePoll, deckTool, Dot, OfflineNote } from "./deck-lib";

// Live fleet readout from the Agent OS via FRIDAY's own fleet_status tool.
// Services report as online/offline; idle agents are counted, not listed —
// a wall of grey rows is noise, not information.

interface FleetData {
  message?: string;
  agents?: string[];
}

interface AgentRow {
  name: string;
  state: string;
  port?: string;
}

function parseAgents(lines: string[]): AgentRow[] {
  return lines
    .map((s): AgentRow | null => {
      const m = s.match(/^(.+?):\s*([\w-]+)(?:\s*\(:(\d+)\))?$/);
      return m ? { name: m[1], state: m[2], port: m[3] || undefined } : null;
    })
    .filter((a): a is AgentRow => a !== null);
}

export function FleetCard() {
  const { data } = usePoll(
    () => deckTool<FleetData>("fleet_status"),
    45_000
  );

  if (!data) return null;
  if (!data.success || !data.data?.agents) {
    return (
      <Panel title="Fleet">
        <OfflineNote text="Agent OS offline on :7777 — start it via Wavelength\agent-os\START.bat." />
      </Panel>
    );
  }

  const agents = parseAgents(data.data.agents);
  const online = agents.filter((a) => a.state === "online");
  const down = agents.filter((a) => a.state === "offline");
  const standby = agents.length - online.length - down.length;

  return (
    <Panel
      title="Fleet"
      right={
        <span className="font-deckmono text-[10px] text-deck-faint">
          {online.length} up
        </span>
      }
    >
      <ul className="space-y-1.5">
        {online.map((a) => (
          <li key={a.name} className="flex items-center gap-2 font-deckmono text-[11px]">
            <Dot tone="ok" />
            <span className="text-deck-ink">{a.name}</span>
            {a.port && <span className="ml-auto text-deck-faint">:{a.port}</span>}
          </li>
        ))}
        {down.map((a) => (
          <li key={a.name} className="flex items-center gap-2 font-deckmono text-[11px]">
            <Dot tone="alert" />
            <span className="text-deck-dim">{a.name}</span>
            {a.port && <span className="ml-auto text-deck-faint">:{a.port}</span>}
          </li>
        ))}
      </ul>
      {standby > 0 && (
        <p className="mt-2 font-deckmono text-[10px] uppercase tracking-wider text-deck-faint">
          +{standby} standby
        </p>
      )}
    </Panel>
  );
}
