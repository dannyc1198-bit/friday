"use client";

import { AlertTriangle, Inbox, KeyRound, Loader2 } from "lucide-react";

export function PageHeader({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return (
    <header className="mb-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-brass">{kicker}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{detail}</p>
    </header>
  );
}

export function StateBlock({
  kind,
  title,
  detail,
}: {
  kind: "loading" | "empty" | "error" | "needs-key";
  title: string;
  detail: string;
}) {
  const Icon = kind === "loading" ? Loader2 : kind === "error" ? AlertTriangle : kind === "needs-key" ? KeyRound : Inbox;
  return (
    <div role={kind === "error" ? "alert" : "status"} className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-panel px-6 py-10 text-center">
      <Icon className={`h-5 w-5 text-faint ${kind === "loading" ? "animate-spin" : ""}`} />
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{detail}</p>
    </div>
  );
}

export function NeedsKey({ show, detail }: { show: boolean; detail?: string }) {
  if (!show) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      <p>{detail || "A model key is not configured. Readings that need a brain stay empty until one is set in the orchestrator environment."}</p>
    </div>
  );
}
