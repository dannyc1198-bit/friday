"use client";

import { useEffect, useState } from "react";
import { usePoll } from "./deck-lib";
import { SAMPLE_CHECKS, useDemo } from "./demo";

interface SetupCheck {
  id: string;
  label: string;
  ok: boolean;
  env: string;
  detail: string;
  optional?: boolean;
}

export function Onboarding({ forceOpen = false }: { forceOpen?: boolean }) {
  const { demo } = useDemo();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const show = () => setHidden(false);
    window.addEventListener("friday-setup", show);
    return () => window.removeEventListener("friday-setup", show);
  }, []);
  const live = usePoll<{ ready: boolean; checks: SetupCheck[] }>(
    async () => {
      const res = await fetch("/api/setup", { cache: "no-store" });
      return res.json();
    },
    20_000
  );
  const checks = demo ? SAMPLE_CHECKS : live.data?.checks || [];
  if (hidden && !forceOpen) return null;
  if (checks.length === 0 && !live.stale) {
    return <p className="text-sm text-deck-dim">Checking setup…</p>;
  }
  return (
    <div className="rounded border border-deck-line bg-deck-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-deckmono text-xs uppercase tracking-wider text-deck-hot">
          {demo ? "Setup · SAMPLE" : "Setup"}
        </p>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="min-h-12 rounded border border-deck-line px-3 text-sm text-deck-dim"
        >
          Hide
        </button>
      </div>
      <ul className="mt-3 grid gap-2">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-sm">
            <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${check.ok ? "bg-deck-ok" : "bg-deck-alert"}`} />
            <span>
              <span className="text-deck-ink">{check.label}</span>
              {check.optional && <span className="ml-2 font-deckmono text-xs text-deck-dim">optional</span>}
              <span className="block text-deck-dim">{check.detail}</span>
              {!check.ok && <span className="font-deckmono text-xs text-deck-gold">{check.env}</span>}
            </span>
          </li>
        ))}
      </ul>
      {live.stale && !demo && <p className="mt-2 text-sm text-deck-alert">Setup status could not be read.</p>}
    </div>
  );
}
