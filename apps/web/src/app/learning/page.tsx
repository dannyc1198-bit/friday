"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type ProposalStatus = "pending" | "applied" | "rejected" | "quarantined" | "stale" | "rolled_back";
type Action = "apply" | "reject" | "rollback";

interface SkillProposal {
  id: string;
  name: string;
  description: string;
  kind: "create" | "update";
  status: ProposalStatus;
  content: string;
  templateName?: string;
  evidence: string[];
  scannerFindings: string[];
  createdAt: string;
  updatedAt: string;
}

interface EvaluatedSkill {
  name: string;
  description: string;
  sourceProposalId: string;
  status: "active" | "retired";
  useCount: number;
  successCount: number;
  partialCount: number;
  failureCount: number;
  unknownCount: number;
  lastUsedAt: string | null;
  retirementReason: string | null;
  evaluation: {
    resolvedUses: number;
    score: number | null;
    confidence: "low" | "medium" | "high";
    label: "unproven" | "promising" | "stable" | "watch" | "retired";
  };
}

interface LearningOverview {
  summary: {
    pending: number;
    quarantined: number;
    active: number;
    retired: number;
    averageScore: number | null;
  };
  proposals: SkillProposal[];
  skills: EvaluatedSkill[];
}

const statusTone: Record<ProposalStatus, string> = {
  pending: "border-deck-amber/35 bg-deck-amber/10 text-deck-hot",
  applied: "border-deck-ok/30 bg-deck-ok/10 text-deck-ok",
  rejected: "border-deck-line bg-deck-raised/40 text-deck-dim",
  quarantined: "border-deck-alert/35 bg-deck-alert/10 text-deck-alert",
  stale: "border-deck-alert/35 bg-deck-alert/10 text-deck-alert",
  rolled_back: "border-deck-line bg-deck-raised/40 text-deck-dim",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const elapsed = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 font-deckmono text-[9px] uppercase tracking-[0.16em] ${statusTone[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function Metric({ label, value, tone = "text-deck-ink" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className={`font-deckmono text-2xl font-medium tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 font-deckmono text-[9px] uppercase tracking-[0.18em] text-deck-faint">{label}</p>
    </div>
  );
}

function ScoreBar({ skill }: { skill: EvaluatedSkill }) {
  const score = skill.evaluation.score;
  const tone = score == null ? "bg-deck-faint" : score >= 75 ? "bg-deck-ok" : score >= 50 ? "bg-deck-amber" : "bg-deck-alert";
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-deck-raised" aria-hidden>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${score ?? 4}%` }} />
      </div>
      <span className="w-10 text-right font-deckmono text-xs tabular-nums text-deck-ink">
        {score == null ? "—" : `${score}%`}
      </span>
    </div>
  );
}

export default function LearningPage() {
  const [overview, setOverview] = useState<LearningOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/skills/overview", { cache: "no-store" });
      if (!response.ok) throw new Error("Friday's learning service is unavailable.");
      const next = await response.json() as LearningOverview;
      setOverview(next);
      setSelectedId((current) => current && next.proposals.some((proposal) => proposal.id === current)
        ? current
        : next.proposals.find((proposal) => proposal.status === "pending" || proposal.status === "quarantined")?.id
          || next.proposals[0]?.id
          || null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Learning data could not be loaded.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(
    () => overview?.proposals.find((proposal) => proposal.id === selectedId) || null,
    [overview, selectedId]
  );
  const reviewQueue = overview?.proposals.filter((proposal) =>
    proposal.status === "pending" || proposal.status === "quarantined"
  ) || [];
  const history = overview?.proposals.filter((proposal) =>
    proposal.status !== "pending" && proposal.status !== "quarantined"
  ) || [];

  const mutate = async (action: Action) => {
    if (!selected) return;
    if (confirmAction !== action) {
      setConfirmAction(action);
      return;
    }
    setBusyAction(action);
    try {
      const response = await fetch(`/api/skills/proposals/${selected.id}/${action}`, {
        method: "POST",
        headers: { "X-Friday-Approval": "approve" },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Could not ${action} proposal.`);
      setConfirmAction(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} proposal.`);
    } finally {
      setBusyAction(null);
    }
  };

  const summary = overview?.summary;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-deck-void font-deckbody text-deck-ink">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-deck-line px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            aria-label="Return to Flight Deck"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-hud border border-deck-line text-deck-dim transition-[color,border-color,transform] duration-150 hover:border-deck-line-bright hover:text-deck-ink active:scale-[0.97] focus-visible:outline-deck-amber"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-deckdisplay text-base font-semibold uppercase tracking-[0.24em] text-deck-ink">Learning Lab</h1>
            <p className="truncate font-deckmono text-[9px] uppercase tracking-[0.18em] text-deck-faint">Governed procedural memory</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={!overview}
          className="flex h-10 items-center gap-2 rounded-hud border border-deck-line px-3 font-deckmono text-[10px] uppercase tracking-[0.14em] text-deck-dim transition-[color,border-color,transform] duration-150 hover:border-deck-line-bright hover:text-deck-ink active:scale-[0.97] disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6 md:py-6">
          <section className="border-b border-deck-line pb-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <div className="mb-2 flex items-center gap-2 font-deckmono text-[10px] uppercase tracking-[0.18em] text-deck-amber">
                  <Sparkles className="h-3.5 w-3.5" /> Learning flight recorder
                </div>
                <h2 className="text-balance font-deckdisplay text-2xl font-semibold leading-tight tracking-[-0.02em] text-deck-ink md:text-[28px]">
                  Review what Friday wants to learn before it changes how she works.
                </h2>
                <p className="mt-2 max-w-xl text-pretty text-[13px] leading-relaxed text-deck-dim">
                  Every procedure keeps its evidence, safety state, measured outcomes, and a rollback path.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-6 md:min-w-[370px] md:justify-items-end">
                <Metric label="Awaiting review" value={summary?.pending ?? "—"} tone="text-deck-hot" />
                <Metric label="Active skills" value={summary?.active ?? "—"} tone="text-deck-ok" />
                <Metric label="Outcome score" value={summary?.averageScore == null ? "—" : `${summary.averageScore}%`} />
              </div>
            </div>
          </section>

          {error && (
            <div role="alert" className="mt-4 flex items-start justify-between gap-4 rounded-hud border border-deck-alert/30 bg-deck-alert/10 px-3 py-2.5 text-sm text-deck-alert">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error" className="h-8 w-8 shrink-0 rounded text-deck-alert hover:bg-deck-alert/10"><X className="mx-auto h-4 w-4" /></button>
            </div>
          )}

          {!overview && !error && (
            <div className="flex min-h-[50vh] items-center justify-center font-deckmono text-xs uppercase tracking-[0.18em] text-deck-dim">
              <RefreshCw className="mr-3 h-4 w-4 animate-spin" /> Reading learning state
            </div>
          )}

          {overview && (
            <>
              <section className="grid gap-4 py-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-hud border border-deck-line bg-deck-panel">
                  <header className="flex items-center justify-between border-b border-deck-line px-3 py-2.5">
                    <h3 className="font-deckdisplay text-[11px] font-semibold uppercase tracking-[0.2em] text-deck-amber">Review queue</h3>
                    <span className="font-deckmono text-[10px] tabular-nums text-deck-faint">{reviewQueue.length}</span>
                  </header>
                  <div className="max-h-[560px] overflow-y-auto p-1.5 [scrollbar-width:thin]">
                    {reviewQueue.length === 0 && history.length === 0 ? (
                      <div className="px-4 py-12 text-center">
                        <ShieldCheck className="mx-auto h-6 w-6 text-deck-ok" />
                        <p className="mt-3 text-sm font-medium text-deck-ink">No proposals yet</p>
                        <p className="mt-1 text-xs leading-relaxed text-deck-dim">Corrections and repeated workflows will appear here for review.</p>
                      </div>
                    ) : (
                      <>
                        {reviewQueue.map((proposal) => (
                          <ProposalRow key={proposal.id} proposal={proposal} active={proposal.id === selectedId} onSelect={setSelectedId} />
                        ))}
                        {history.length > 0 && (
                          <>
                            <p className="px-2 pb-1 pt-4 font-deckmono text-[9px] uppercase tracking-[0.18em] text-deck-faint">Decision history</p>
                            {history.map((proposal) => (
                              <ProposalRow key={proposal.id} proposal={proposal} active={proposal.id === selectedId} onSelect={setSelectedId} />
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <ProposalDetail
                  proposal={selected}
                  confirmAction={confirmAction}
                  busyAction={busyAction}
                  onAction={mutate}
                  onCancel={() => setConfirmAction(null)}
                />
              </section>

              <section className="pb-8">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <h3 className="font-deckdisplay text-[13px] font-semibold uppercase tracking-[0.2em] text-deck-amber">Active procedure telemetry</h3>
                    <p className="mt-1 text-xs text-deck-dim">Resolved outcomes score success as 1, partial as 0.5, and failure as 0.</p>
                  </div>
                  <span className="font-deckmono text-[9px] uppercase tracking-[0.15em] text-deck-faint">8 poor measured uses triggers retirement</span>
                </div>
                <div className="overflow-hidden rounded-hud border border-deck-line bg-deck-panel">
                  {overview.skills.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-deck-dim">No approved procedures are active yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] border-collapse text-left">
                        <thead className="border-b border-deck-line bg-deck-raised/30 font-deckmono text-[9px] uppercase tracking-[0.16em] text-deck-faint">
                          <tr><th className="px-4 py-2.5 font-medium">Procedure</th><th className="px-4 py-2.5 font-medium">Quality</th><th className="px-4 py-2.5 font-medium">Outcome score</th><th className="px-4 py-2.5 text-right font-medium">Uses</th><th className="px-4 py-2.5 text-right font-medium">Last used</th></tr>
                        </thead>
                        <tbody className="divide-y divide-deck-line">
                          {overview.skills.map((skill) => (
                            <tr key={skill.name} className="transition-colors duration-150 hover:bg-deck-raised/25">
                              <td className="px-4 py-3"><p className="font-deckdisplay text-sm font-semibold text-deck-ink">{skill.name}</p><p className="mt-0.5 max-w-md truncate text-[11px] text-deck-dim">{skill.description}</p></td>
                              <td className="px-4 py-3"><span className={`font-deckmono text-[10px] uppercase tracking-[0.12em] ${skill.status === "retired" ? "text-deck-alert" : skill.evaluation.label === "stable" ? "text-deck-ok" : skill.evaluation.label === "watch" ? "text-deck-alert" : "text-deck-amber"}`}>{skill.evaluation.label}</span><p className="mt-0.5 font-deckmono text-[9px] text-deck-faint">{skill.evaluation.confidence} confidence</p></td>
                              <td className="w-[240px] px-4 py-3"><ScoreBar skill={skill} /></td>
                              <td className="px-4 py-3 text-right font-deckmono text-xs tabular-nums text-deck-ink">{skill.useCount}<p className="mt-0.5 text-[9px] text-deck-faint">{skill.evaluation.resolvedUses} measured</p></td>
                              <td className="px-4 py-3 text-right font-deckmono text-[10px] text-deck-dim">{relativeTime(skill.lastUsedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ProposalRow({ proposal, active, onSelect }: { proposal: SkillProposal; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(proposal.id)}
      className={`mb-1 flex min-h-16 w-full items-center gap-3 rounded px-2.5 py-2 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.99] ${active ? "bg-deck-raised text-deck-ink" : "text-deck-dim hover:bg-deck-raised/45 hover:text-deck-ink"}`}
    >
      <span className={`h-8 w-0.5 shrink-0 rounded-full ${proposal.status === "pending" ? "bg-deck-amber" : proposal.status === "quarantined" ? "bg-deck-alert" : "bg-deck-faint"}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2"><span className="truncate font-deckdisplay text-sm font-semibold">{proposal.name}</span><StatusBadge status={proposal.status} /></span>
        <span className="mt-1 block truncate text-[11px] text-deck-dim">{proposal.description}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-deck-faint" />
    </button>
  );
}

function ProposalDetail({ proposal, confirmAction, busyAction, onAction, onCancel }: { proposal: SkillProposal | null; confirmAction: Action | null; busyAction: Action | null; onAction: (action: Action) => void; onCancel: () => void }) {
  if (!proposal) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-hud border border-deck-line bg-deck-panel px-8 text-center text-sm text-deck-dim">Select a proposal to inspect its exact instructions and evidence.</div>;
  }
  const body = proposal.content.replace(/^---[\s\S]*?---\s*/, "").trim();
  const canReview = proposal.status === "pending";
  const canReject = proposal.status === "pending" || proposal.status === "quarantined";
  const canRollback = proposal.status === "applied";

  return (
    <article className="min-w-0 overflow-hidden rounded-hud border border-deck-line bg-deck-panel">
      <header className="border-b border-deck-line px-4 py-3.5 md:px-5">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={proposal.status} /><span className="font-deckmono text-[9px] uppercase tracking-[0.16em] text-deck-faint">{proposal.kind} proposal · {relativeTime(proposal.updatedAt)}</span></div>
        <h3 className="mt-2 text-balance font-deckdisplay text-xl font-semibold text-deck-ink">{proposal.name}</h3>
        <p className="mt-1 text-pretty text-[13px] leading-relaxed text-deck-dim">{proposal.description}</p>
      </header>
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_240px] md:p-5">
        <section className="min-w-0">
          <h4 className="mb-2 flex items-center gap-2 font-deckmono text-[9px] uppercase tracking-[0.18em] text-deck-faint"><Activity className="h-3.5 w-3.5" /> Proposed procedure</h4>
          <pre className="max-h-[330px] overflow-auto whitespace-pre-wrap rounded-hud bg-deck-void px-3 py-3 font-deckmono text-[11px] leading-relaxed text-deck-dim [scrollbar-width:thin]">{body}</pre>
        </section>
        <aside className="space-y-4">
          <section>
            <h4 className="mb-2 flex items-center gap-2 font-deckmono text-[9px] uppercase tracking-[0.18em] text-deck-faint"><CircleDot className="h-3.5 w-3.5" /> Evidence</h4>
            {proposal.evidence.length ? <ul className="space-y-2">{proposal.evidence.map((item, index) => <li key={`${index}-${item.slice(0, 12)}`} className="border-l-2 border-deck-line-bright pl-2 text-[11px] leading-relaxed text-deck-dim">{item}</li>)}</ul> : <p className="text-[11px] leading-relaxed text-deck-faint">No source evidence was attached.</p>}
          </section>
          <section>
            <h4 className="mb-2 flex items-center gap-2 font-deckmono text-[9px] uppercase tracking-[0.18em] text-deck-faint"><ShieldCheck className="h-3.5 w-3.5" /> Safety scan</h4>
            {proposal.scannerFindings.length ? <ul className="space-y-1.5 text-[11px] text-deck-alert">{proposal.scannerFindings.map((finding) => <li key={finding}>{finding}</li>)}</ul> : <p className="flex items-center gap-2 text-[11px] text-deck-ok"><Check className="h-3.5 w-3.5" /> No findings</p>}
            {proposal.templateName && <p className="mt-2 font-deckmono text-[9px] text-deck-faint">template · {proposal.templateName}</p>}
          </section>
        </aside>
      </div>

      {(canReview || canReject || canRollback) && (
        <footer className="border-t border-deck-line px-4 py-3 md:px-5">
          {confirmAction ? (
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-xs text-deck-ink"><Clock3 className="h-4 w-4 text-deck-amber" />{confirmAction === "apply" ? "Activate this procedure for future conversations?" : confirmAction === "reject" ? "Reject this proposal and preserve it in history?" : "Restore the procedure version from before this proposal?"}</p>
              <div className="flex gap-2">
                <button onClick={onCancel} disabled={busyAction != null} className="h-10 rounded-hud border border-deck-line px-3 font-deckmono text-[10px] uppercase tracking-[0.12em] text-deck-dim hover:border-deck-line-bright hover:text-deck-ink disabled:opacity-40">Cancel</button>
                <button onClick={() => onAction(confirmAction)} disabled={busyAction != null} className={`h-10 rounded-hud border px-3 font-deckmono text-[10px] uppercase tracking-[0.12em] transition-transform duration-150 active:scale-[0.97] disabled:opacity-40 ${confirmAction === "apply" ? "border-deck-ok/40 bg-deck-ok/10 text-deck-ok" : "border-deck-alert/40 bg-deck-alert/10 text-deck-alert"}`}>{busyAction ? "Working…" : `Confirm ${confirmAction}`}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {canReject && <button onClick={() => onAction("reject")} className="flex h-10 items-center gap-2 rounded-hud border border-deck-line px-3 font-deckmono text-[10px] uppercase tracking-[0.12em] text-deck-dim hover:border-deck-alert/40 hover:text-deck-alert active:scale-[0.97]"><X className="h-3.5 w-3.5" /> Reject</button>}
              {canRollback && <button onClick={() => onAction("rollback")} className="flex h-10 items-center gap-2 rounded-hud border border-deck-alert/35 bg-deck-alert/10 px-3 font-deckmono text-[10px] uppercase tracking-[0.12em] text-deck-alert active:scale-[0.97]"><RotateCcw className="h-3.5 w-3.5" /> Roll back</button>}
              {canReview && <button onClick={() => onAction("apply")} className="flex h-10 items-center gap-2 rounded-hud border border-deck-ok/35 bg-deck-ok/10 px-3 font-deckmono text-[10px] uppercase tracking-[0.12em] text-deck-ok active:scale-[0.97]"><Check className="h-3.5 w-3.5" /> Approve & activate</button>}
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
