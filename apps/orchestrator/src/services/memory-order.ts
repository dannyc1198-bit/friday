// Retrieval order: the current turn, then dated evidence, then older notes.
// The shared-brain entrypoint and the current audit are loaded on purpose.

import path from "path";

export const EVIDENCE_ORDER =
  "EVIDENCE ORDER: What Danny says in this conversation outranks everything. Dated notes and the current audit come next. Older or undated notes lose. The pinned profile is background, not a veto. If dates disagree or a milestone date has passed, say which date you are using and what is uncertain.";

export function classifyBrainFile(relative: string): "shared" | "audit" | "older" {
  const name = relative.replace(/\\/g, "/");
  if (/SHARED-AI-BRAIN\.md$/i.test(name)) return "shared";
  if (/(^|\/)(current-audit|CURRENT-AUDIT|AUDIT)\.md$/i.test(name)) return "audit";
  return "older";
}

export function bootstrapPaths(vaultRoot: string, brainDir: string): string[] {
  return [
    path.join(vaultRoot, "Agents", "SHARED-AI-BRAIN.md"),
    path.join(vaultRoot, "SHARED-AI-BRAIN.md"),
    path.join(brainDir, "SHARED-AI-BRAIN.md"),
    path.join(brainDir, "current-audit.md"),
    path.join(brainDir, "CURRENT-AUDIT.md"),
    path.join(vaultRoot, "AUDIT.md"),
  ];
}

export function formatBootstrapSection(kind: "shared" | "audit", body: string): string {
  const title = kind === "shared" ? "SHARED BRAIN ENTRYPOINT" : "CURRENT AUDIT";
  return `# ${title}\n\n${body.trim()}`;
}
