"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemo } from "@/components/deck/demo";
import { SAMPLE_PROPOSAL } from "@/lib/demo-boundary";
import { Column, DataTable, Drawer } from "./DataTable";
import { PageHeader } from "./States";
import { useResource } from "./useResource";

interface Draft {
  id: string;
  name: string;
  description: string;
  status: string;
  updatedAt: string;
  content: string;
}

interface Job {
  id: string;
  title: string;
  status: string;
  progress: number;
  detail: string;
  files?: { name: string; label: string }[];
}

const SAMPLE_SKILLS = {
  proposals: [SAMPLE_PROPOSAL] as Draft[],
  summary: { pending: 1 },
};

const SAMPLE_MEDIA = {
  jobs: [
    { id: "sample-job", title: "SAMPLE · brass arc on a bench", status: "ready", progress: 100, detail: "SAMPLE file. Nothing was generated.", files: [] },
  ] as Job[],
};

const DRAFT_COLUMNS: Column<Draft>[] = [
  { key: "name", header: "Draft", sortValue: (row) => row.name, cell: (row) => row.name },
  { key: "status", header: "Status", sortValue: (row) => row.status, cell: (row) => row.status },
  { key: "updated", header: "Updated", sortValue: (row) => row.updatedAt, cell: (row) => row.updatedAt.slice(0, 10) },
];

const JOB_COLUMNS: Column<Job>[] = [
  { key: "title", header: "Job", sortValue: (row) => row.title, cell: (row) => row.title },
  { key: "status", header: "Status", sortValue: (row) => row.status, cell: (row) => row.status },
  { key: "progress", header: "Progress", sortValue: (row) => row.progress, cell: (row) => `${row.progress}%` },
];

export function ContentPage() {
  const { demo } = useDemo();
  const router = useRouter();
  const skills = useResource<{ proposals?: Draft[] }>("/api/skills/overview", SAMPLE_SKILLS);
  const media = useResource<{ jobs?: Job[] }>("/api/media", SAMPLE_MEDIA);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [prompt, setPrompt] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const subject = prompt.trim() || "a calm brass arc reactor on a dark bench";

  function stage(text: string) {
    if (demo) {
      setNote("Demo mode does not send. Nothing left this browser.");
      return;
    }
    router.push(`/talk?prefill=${encodeURIComponent(text)}`);
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
      <PageHeader kicker="Studio" title="Content" detail="Hooks and scripts are drafts. Image, video, and 3D jobs stay in the gallery until a key is present." />
      <label className="mb-4 block text-sm text-muted">
        Prompt
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-line bg-panel p-3 text-sm text-ink outline-none" placeholder="What should we make?" />
      </label>
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          ["YouTube hook", `Draft a YouTube hook about ${subject}. Draft only.`],
          ["TikTok hook", `Draft a TikTok hook about ${subject}. Draft only.`],
          ["Script", `Draft a short video script about ${subject}. Draft only.`],
          ["Image", `Make an image of ${subject}`],
          ["Video", `Make a video of ${subject}`],
          ["3D model", `Make a 3D model of ${subject}`],
        ].map(([label, text]) => (
          <button key={label} type="button" onClick={() => stage(text)} className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:bg-raised">
            {label}
          </button>
        ))}
      </div>
      {note && <p className="mb-4 text-sm text-brass">{note}</p>}

      <h2 className="mb-3 text-sm font-semibold text-ink">Drafts awaiting approval</h2>
      <DataTable
        rows={(skills.data?.proposals || []).filter((item) => item.status === "pending" || item.status === "quarantined" || demo)}
        columns={DRAFT_COLUMNS}
        searchText={(row) => `${row.name} ${row.description} ${row.status}`}
        loading={skills.loading}
        error={skills.error}
        emptyTitle="No drafts"
        emptyDetail="Pending skill proposals show up here. Learning still holds the full review."
        onRow={setDraft}
      />
      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink">Gallery</h2>
      <DataTable
        rows={media.data?.jobs || []}
        columns={JOB_COLUMNS}
        searchText={(row) => `${row.title} ${row.status} ${row.detail}`}
        loading={media.loading}
        error={media.error}
        emptyTitle="No jobs"
        emptyDetail="Nothing has been generated yet."
        onRow={setJob}
      />
      {draft && (
        <Drawer title={draft.name} onClose={() => { setDraft(null); setConfirm(false); }}>
          <p className="text-sm text-muted">{draft.status}</p>
          <p className="mt-3 text-sm text-ink">{draft.description}</p>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-app p-3 font-mono text-xs text-muted">{draft.content}</pre>
          {confirm ? (
            <div className="mt-4 flex gap-2">
              <button type="button" className="rounded border border-line px-3 py-2 text-sm" onClick={() => setConfirm(false)}>Cancel</button>
              <button
                type="button"
                className="rounded border border-ok px-3 py-2 text-sm text-ok"
                onClick={() => {
                  if (demo) {
                    setNote("Demo mode does not approve procedures. Nothing changed.");
                    return;
                  }
                  void fetch(`/api/skills/proposals/${encodeURIComponent(draft.id)}/apply`, {
                    method: "POST",
                    headers: { "X-Friday-Approval": "approve" },
                  }).then(() => {
                    setDraft(null);
                    setConfirm(false);
                    void skills.reload();
                  });
                }}
              >
                Confirm approve
              </button>
            </div>
          ) : (
            <button type="button" className="mt-4 rounded border border-line px-3 py-2 text-sm" onClick={() => setConfirm(true)}>
              Approve
            </button>
          )}
        </Drawer>
      )}
      {job && (
        <Drawer title={job.title} onClose={() => setJob(null)}>
          <p className="text-sm text-ink">{job.status} · {job.progress}%</p>
          <p className="mt-2 text-sm text-muted">{job.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(job.files || []).map((file) => (
              /\.(png|jpe?g|webp)$/i.test(file.name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={file.name} alt={file.label} src={`/api/media/file?name=${encodeURIComponent(file.name)}`} className="h-24 rounded border border-line" />
              ) : (
                <a key={file.name} className="text-sm text-brass underline" href={`/api/media/file?name=${encodeURIComponent(file.name)}`}>{file.label}</a>
              )
            ))}
          </div>
        </Drawer>
      )}
    </div>
  );
}
