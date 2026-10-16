"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, FileCheck2, ListTodo, Sparkles, Wrench } from "lucide-react";
import { SAMPLE_AGENTS, SAMPLE_TASK, SAMPLE_THOUGHTS } from "@/components/deck/demo";
import { bucketActivity, nextEiReport } from "@/lib/console";
import { useResource } from "./useResource";
import { LiveAppsTiles } from "./LiveAppsTiles";
import { NeedsKey, PageHeader, StateBlock } from "./States";

const ActivityChart = dynamic(() => import("./ActivityChart"), {
  ssr: false,
  loading: () => <div className="h-64" />,
});

interface TaskRow {
  id: string;
  text: string;
  priority: string;
  due?: string;
  completed: boolean;
  createdAt: string;
}

interface Thought {
  id: string;
  at: string;
  kind: string;
  label: string;
  detail: string;
}

interface Specialist {
  id: string;
  name: string;
  role: string;
  status: string;
  lastTask: string;
}

const SAMPLE_TODAY = {
  task: { id: "sample", text: SAMPLE_TASK, priority: "high", due: "sample" },
};

const SAMPLE_TASK_BODY = {
  tasks: [
    { id: "sample-1", text: SAMPLE_TASK, priority: "high", due: "sample", completed: false, createdAt: "2026-10-15T15:00:00.000Z" },
  ] as TaskRow[],
};

const SAMPLE_OVERVIEW = {
  summary: { pending: 1, quarantined: 0, active: 0, retired: 0, averageScore: null as number | null },
};

const SAMPLE_REPAIRS = {
  repairs: [{ id: "sample-repair", status: "needs_approval", summary: "SAMPLE repair waiting", branch: "sample", detail: "Nothing was merged." }],
};

const SAMPLE_MIND = {
  specialists: [
    { id: "jarvis", name: "J.A.R.V.I.S.", role: "Security and money", status: "idle", lastTask: "SAMPLE · no live task" },
    { id: "edith", name: "E.D.I.T.H.", role: "Content and creative", status: "idle", lastTask: "SAMPLE · no live task" },
    { id: "dume", name: "DUM-E", role: "Builder", status: "idle", lastTask: "SAMPLE · no live task" },
    { id: "u", name: "U", role: "Sales and clients", status: "idle", lastTask: "SAMPLE · no live task" },
    { id: "vision", name: "VISION", role: "Coach and planner", status: "idle", lastTask: "SAMPLE · no live task" },
    { id: "ultron", name: "ULTRON", role: "Red team", status: "idle", lastTask: "SAMPLE · no live task" },
  ] as Specialist[],
};

const SAMPLE_HEALTH = { ok: true, llm: { configured: true, provider: "sample" } };
const SAMPLE_AGENTS_BODY = { agents: SAMPLE_AGENTS };
const SAMPLE_THOUGHT_BODY = { thoughts: SAMPLE_THOUGHTS };

export function Overview() {
  const tasks = useResource<{ tasks?: TaskRow[]; error?: string }>("/api/tasks", SAMPLE_TASK_BODY);
  const skills = useResource<typeof SAMPLE_OVERVIEW>("/api/skills/overview", SAMPLE_OVERVIEW);
  const upkeep = useResource<typeof SAMPLE_REPAIRS>("/api/upkeep", SAMPLE_REPAIRS);
  const mind = useResource<typeof SAMPLE_MIND>("/api/mindspace", SAMPLE_MIND);
  const health = useResource<typeof SAMPLE_HEALTH>("/api/health", SAMPLE_HEALTH);
  const agents = useResource<typeof SAMPLE_AGENTS_BODY>("/api/agents", SAMPLE_AGENTS_BODY);
  const thoughts = useResource<{ thoughts?: Thought[] }>("/api/neural/thoughts", SAMPLE_THOUGHT_BODY);
  const today = useResource<typeof SAMPLE_TODAY>("/api/today", SAMPLE_TODAY);

  const open = (tasks.data?.tasks || []).filter((task) => !task.completed);
  const pendingDrafts = skills.data?.summary?.pending ?? 0;
  const pendingRepairs = (upkeep.data?.repairs || []).filter((repair) => repair.status === "needs_approval").length;
  const working = (mind.data?.specialists || []).filter((card) => card.status === "working").length;
  const online = (agents.data?.agents || []).filter((agent) => agent.state === "online").length;
  const points = bucketActivity((thoughts.data?.thoughts || []).map((thought) => thought.at), new Date());
  const hasActivity = points.some((point) => point.count > 0);
  const needsKey = !health.demo && Boolean(health.data) && health.data?.llm?.configured === false;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
      <PageHeader kicker="Today" title="Overview" detail="One next task, the work waiting on you, and whether the specialists are idle." />
      <NeedsKey show={needsKey} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={ListTodo} label="Open tasks" value={tasks.loading ? "…" : String(open.length)} href="/tasks" note={tasks.error || "From the task file"} />
        <Kpi icon={FileCheck2} label="Drafts awaiting approval" value={skills.loading ? "…" : String(pendingDrafts)} href="/content" note={skills.error || "Skill proposals still pending"} />
        <Kpi icon={Wrench} label="Repairs pending" value={upkeep.loading ? "…" : String(pendingRepairs)} href="/repairs" note={upkeep.error || "Nothing merges until you approve"} />
        <Kpi icon={Sparkles} label="Next EI report" value={nextEiReport(new Date())} href="/businesses/ally" note="Monday. Drafts only." />
        <Kpi icon={Activity} label="Agent activity" value={mind.loading ? "…" : `${working} live`} href="/mindspace" note={`${online} fleet online`} />
      </section>

      <LiveAppsTiles />

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Activity</h2>
            <span className="text-xs text-faint">Last 12 hours</span>
          </div>
          {thoughts.loading && <StateBlock kind="loading" title="Loading activity" detail="Reading the neural log." />}
          {thoughts.error && <StateBlock kind="error" title="Activity unavailable" detail={thoughts.error} />}
          {!thoughts.loading && !thoughts.error && !hasActivity && (
            <StateBlock kind="empty" title="No activity yet" detail="Thoughts, tools, and repairs will chart here as they happen." />
          )}
          {!thoughts.loading && !thoughts.error && hasActivity && <ActivityChart points={points} />}
          <ol className="mt-4 grid gap-2">
            {(thoughts.data?.thoughts || []).slice(0, 6).map((thought) => (
              <li key={thought.id} className="flex items-baseline justify-between gap-3 border-t border-line pt-2 text-sm">
                <span className="text-ink">{thought.label}</span>
                <span className="shrink-0 text-xs text-faint">{thought.kind}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="grid gap-4">
          <article className="rounded-lg border border-brass/50 bg-panel p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass">Next task</p>
            {today.loading && <p className="mt-3 text-sm text-muted">Checking the queue…</p>}
            {today.error && <p className="mt-3 text-sm text-danger">{today.error}</p>}
            {!today.loading && !today.error && (
              <p className="mt-3 text-xl font-semibold tracking-tight text-ink">{today.data?.task?.text || "Nothing queued."}</p>
            )}
            {today.data?.task?.due && <p className="mt-2 text-sm text-muted">Due {today.data.task.due}</p>}
            <Link href="/tasks" className="mt-4 inline-flex text-sm text-brass hover:underline">
              Open tasks
            </Link>
          </article>
          <article className="rounded-lg border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Mindspace</h2>
              <Link href="/mindspace" className="text-xs text-brass hover:underline">All six</Link>
            </div>
            {mind.error && <p className="text-sm text-danger">{mind.error}</p>}
            <ul className="grid grid-cols-2 gap-2">
              {(mind.data?.specialists || []).map((card) => (
                <li key={card.id} className="rounded-md border border-line px-3 py-2">
                  <p className="text-sm font-medium text-ink">{card.name}</p>
                  <p className="text-xs text-muted">{card.status}</p>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  href,
}: {
  icon: typeof ListTodo;
  label: string;
  value: string;
  note: string;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-line bg-panel p-4 hover:border-line-strong">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{label}</p>
        <Icon className="h-4 w-4 text-faint" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-1 truncate text-xs text-faint">{note}</p>
    </Link>
  );
}
