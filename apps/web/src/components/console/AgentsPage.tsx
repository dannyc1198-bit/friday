"use client";

import Link from "next/link";
import { MessageSquare, Mic } from "lucide-react";
import { SAMPLE_AGENTS } from "@/components/deck/demo";
import { MindspacePage } from "./MindspacePage";
import { useResource } from "./useResource";

interface FleetAgent {
  id: string;
  name: string;
  kind?: string;
  state: string;
  detail?: string;
}

const SAMPLE_BODY = { agents: SAMPLE_AGENTS as FleetAgent[] };

// Every agent on one page: the six specialists around Friday, then the rest of the fleet.
export function AgentsPage() {
  const fleet = useResource<{ agents?: FleetAgent[] }>("/api/agents", SAMPLE_BODY);
  return (
    <div>
      <MindspacePage />
      <section className="mx-auto w-full max-w-[1440px] px-4 pb-10 md:px-8">
        <h2 className="mb-1 text-sm font-semibold text-ink">The rest of the fleet</h2>
        <p className="mb-3 text-xs text-muted">Other agents Friday knows about. Talk opens a thread with Friday about that agent; Voice starts it hands-free.</p>
        {fleet.error && <p className="text-sm text-danger">{fleet.error}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(fleet.data?.agents || []).map((agent) => {
            const prompt = encodeURIComponent(`What is ${agent.name} doing right now?`);
            return (
              <article key={agent.id} className="rounded-lg border border-line bg-panel p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${agent.state === "online" || agent.state === "ready" ? "bg-ok" : agent.state === "offline" ? "bg-danger" : "bg-warn"}`} />
                  <span className="text-sm font-medium text-ink">{agent.name}</span>
                  <span className="ml-auto text-xs text-faint">{agent.state}</span>
                </div>
                {agent.detail && <p className="mt-2 line-clamp-2 text-xs text-muted">{agent.detail}</p>}
                <div className="mt-3 flex gap-2">
                  <Link href={`/talk?prefill=${prompt}`} className="inline-flex h-8 items-center gap-1 rounded border border-line px-2 text-xs text-muted hover:text-ink">
                    <MessageSquare className="h-3.5 w-3.5" /> Talk
                  </Link>
                  <Link href={`/talk?prefill=${prompt}&voice=1`} className="inline-flex h-8 items-center gap-1 rounded border border-brass/50 px-2 text-xs text-brass hover:bg-brass/10">
                    <Mic className="h-3.5 w-3.5" /> Voice
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}