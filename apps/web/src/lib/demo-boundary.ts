// Demo mode is a browser-wide boundary, not a flag on one button.

export const DEMO_STORAGE_KEY = "friday-demo";
export const DEMO_COOKIE = "friday-demo";

export function demoCookieValue(on: boolean): string {
  return on
    ? `${DEMO_COOKIE}=1; Path=/; SameSite=Strict`
    : `${DEMO_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
}

export function demoCookieEnabled(header: string | null | undefined): boolean {
  return /(?:^|;\s*)friday-demo=1(?:\s*;|$)/.test(header || "");
}

export const SAMPLE_THREAD = [
  {
    id: "sample-user",
    role: "user" as const,
    content: "SAMPLE · What is on the launch checklist?",
    timestamp: "2026-10-15T15:00:00.000Z",
  },
  {
    id: "sample-friday",
    role: "assistant" as const,
    content: "SAMPLE · Northwind Studio's checklist is a fictional note. Nothing here is from a saved conversation. [[notes/launch-checklist]]",
    timestamp: "2026-10-15T15:00:04.000Z",
  },
];

export const SAMPLE_PROPOSAL = {
  id: "sample-proposal",
  name: "SAMPLE morning brief",
  description: "SAMPLE · A fictional procedure. Approving it does nothing.",
  kind: "create" as const,
  status: "pending" as const,
  content: "SAMPLE · Keep the morning brief to one screen.",
  evidence: ["SAMPLE transcript"],
  scannerFindings: [],
  createdAt: "2026-10-15T15:00:00.000Z",
  updatedAt: "2026-10-15T15:00:00.000Z",
};
