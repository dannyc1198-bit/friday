"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/deck/demo";
import { PageHeader } from "./States";

export interface BusinessAction {
  label: string;
  hint: string;
  prompt: string;
}

export function BusinessPage({
  kicker,
  title,
  detail,
  actions,
  empty,
}: {
  kicker: string;
  title: string;
  detail: string;
  actions: BusinessAction[];
  empty: string;
}) {
  const { demo } = useDemo();
  const router = useRouter();
  const [note, setNote] = useState("");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <PageHeader kicker={kicker} title={title} detail={detail} />
      <p className="mb-4 text-sm text-muted">{empty}</p>
      <ul className="grid gap-3">
        {actions.map((action) => (
          <li key={action.label}>
            <button
              type="button"
              className="w-full rounded-lg border border-line bg-panel px-4 py-4 text-left hover:border-line-strong"
              onClick={() => {
                if (demo) {
                  setNote(`${action.label} stays on this screen. Nothing was sent.`);
                  return;
                }
                router.push(`/talk?prefill=${encodeURIComponent(action.prompt)}`);
              }}
            >
              <span className="block text-sm font-medium text-ink">{action.label}</span>
              <span className="mt-1 block text-sm text-muted">{action.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="mt-4 text-sm text-brass">{note}</p>}
    </div>
  );
}
