"use client";

import { useState } from "react";
import { useDemo } from "@/components/deck/demo";
import { Column, DataTable, Drawer } from "./DataTable";
import { PageHeader } from "./States";
import { useResource } from "./useResource";

interface Repair {
  id: string;
  status: string;
  summary: string;
  detail: string;
  branch: string;
  testSummary?: string;
}

const SAMPLE = {
  repairs: [
    {
      id: "sample-repair",
      status: "needs_approval",
      summary: "SAMPLE repair waiting",
      detail: "Nothing was merged.",
      branch: "sample/repair",
      testSummary: "SAMPLE",
    },
  ] as Repair[],
};

const COLUMNS: Column<Repair>[] = [
  { key: "summary", header: "Repair", sortValue: (row) => row.summary, cell: (row) => row.summary },
  { key: "status", header: "Status", sortValue: (row) => row.status, cell: (row) => row.status.replace(/_/g, " ") },
  { key: "branch", header: "Branch", sortValue: (row) => row.branch, cell: (row) => <span className="font-mono text-xs">{row.branch}</span> },
];

export function RepairsPage() {
  const { demo } = useDemo();
  const resource = useResource<{ repairs?: Repair[] }>("/api/upkeep", SAMPLE);
  const [selected, setSelected] = useState<Repair | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(action: "approve" | "reject") {
    if (!selected) return;
    if (demo) {
      setNote("Demo does not approve repairs. Nothing was merged.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/upkeep/repairs/${encodeURIComponent(selected.id)}/${action}`, { method: "POST" });
      if (!res.ok) setNote("That decision was not accepted.");
      else {
        setNote(action === "approve" ? "Approved. Main is still not the merge target from this screen." : "Rejected.");
        setSelected(null);
        await resource.reload();
      }
    } catch {
      setNote("The repair service did not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
      <PageHeader kicker="Maintenance" title="Repairs" detail="A fix waits here until you approve it. Main and master are never the merge target from this screen." />
      {note && <p className="mb-4 text-sm text-brass">{note}</p>}
      <DataTable
        rows={resource.data?.repairs || []}
        columns={COLUMNS}
        searchText={(row) => `${row.summary} ${row.status} ${row.branch} ${row.detail}`}
        loading={resource.loading}
        error={resource.error}
        emptyTitle="No repairs"
        emptyDetail="The queue is empty."
        onRow={setSelected}
      />
      {selected && (
        <Drawer title="Approval" onClose={() => setSelected(null)}>
          <p className="text-base font-medium text-ink">{selected.summary}</p>
          <p className="mt-2 text-sm text-muted">{selected.status} · {selected.branch}</p>
          <p className="mt-3 text-sm text-ink">{selected.detail}</p>
          {selected.testSummary && <p className="mt-2 text-xs text-faint">{selected.testSummary}</p>}
          {selected.status === "needs_approval" && (
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void decide("approve")} className="rounded border border-ok px-3 py-2 text-sm text-ok disabled:opacity-40">Approve</button>
              <button type="button" disabled={busy} onClick={() => void decide("reject")} className="rounded border border-line px-3 py-2 text-sm text-muted disabled:opacity-40">Reject</button>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
