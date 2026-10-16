"use client";

import { useState } from "react";
import { SAMPLE_TASK } from "@/components/deck/demo";
import { Column, DataTable, Drawer } from "./DataTable";
import { PageHeader } from "./States";
import { useResource } from "./useResource";

interface TaskRow {
  id: string;
  text: string;
  priority: string;
  due?: string;
  completed: boolean;
  createdAt: string;
}

const SAMPLE = {
  tasks: [
    { id: "sample-1", text: SAMPLE_TASK, priority: "high", due: "sample", completed: false, createdAt: "2026-10-15T15:00:00.000Z" },
    { id: "sample-2", text: "SAMPLE · Approve the morning brief draft", priority: "medium", completed: false, createdAt: "2026-10-15T14:00:00.000Z" },
  ] as TaskRow[],
};

const COLUMNS: Column<TaskRow>[] = [
  { key: "text", header: "Task", sortValue: (row) => row.text, cell: (row) => row.text },
  { key: "priority", header: "Priority", sortValue: (row) => row.priority, cell: (row) => row.priority },
  { key: "due", header: "Due", sortValue: (row) => row.due || "", cell: (row) => row.due || "—" },
  { key: "state", header: "State", sortValue: (row) => (row.completed ? 1 : 0), cell: (row) => (row.completed ? "Done" : "Open") },
];

export function TasksPage() {
  const resource = useResource<{ tasks?: TaskRow[]; error?: string }>("/api/tasks", SAMPLE);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const rows = resource.data?.tasks || [];
  const error = resource.error || resource.data?.error || "";

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
      <PageHeader kicker="Work" title="Tasks" detail="The same file Today reads. This list is read-only. Finish or edit a task by asking Friday in Talk." />
      <DataTable
        rows={rows}
        columns={COLUMNS}
        searchText={(row) => `${row.text} ${row.priority} ${row.due || ""}`}
        loading={resource.loading}
        error={error}
        emptyTitle="No tasks"
        emptyDetail="Nothing is stored in the task file yet."
        onRow={setSelected}
      />
      {selected && (
        <Drawer title="Task" onClose={() => setSelected(null)}>
          <p className="text-lg font-medium text-ink">{selected.text}</p>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Priority</dt><dd>{selected.priority}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Due</dt><dd>{selected.due || "None"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">State</dt><dd>{selected.completed ? "Done" : "Open"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Id</dt><dd className="font-mono text-xs">{selected.id}</dd></div>
          </dl>
        </Drawer>
      )}
    </div>
  );
}
