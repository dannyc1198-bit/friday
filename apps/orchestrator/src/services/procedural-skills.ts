// Governed procedural learning for FRIDAY.
//
// Facts belong in the Obsidian brain. Repeatable ways of working belong here.
// The agent may draft proposals automatically, but active SKILL.md files only
// change through an explicit apply operation with rollback metadata.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { SKILLS_DIR, SKILL_WORKSHOP_DIR, localTimestamp } from "./runtime-paths.js";

const PROPOSALS_FILE = path.join(SKILL_WORKSHOP_DIR, "proposals.json");
const MAX_PENDING = 50;
const MAX_SKILL_CHARS = 40_000;

export type ProposalStatus = "pending" | "applied" | "rejected" | "quarantined" | "stale" | "rolled_back";

export interface SkillProposal {
  id: string;
  name: string;
  description: string;
  kind: "create" | "update";
  status: ProposalStatus;
  content: string;
  templateName?: string;
  templateContent?: string;
  evidence: string[];
  targetHash: string | null;
  scannerFindings: string[];
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  rejectedAt?: string;
  rolledBackAt?: string;
}

export type SkillLifecycleStatus = "active" | "retired";
export type ProceduralOutcome = "success" | "partial" | "failure" | "unknown";

export interface ActiveSkillManifest {
  name: string;
  description: string;
  content: string;
  sourceProposalId: string;
  createdAt: string;
  updatedAt: string;
  status: SkillLifecycleStatus;
  useCount: number;
  lastUsedAt: string | null;
  successCount: number;
  partialCount: number;
  failureCount: number;
  unknownCount: number;
  lastOutcomeAt: string | null;
  retiredAt: string | null;
  retirementReason: string | null;
}

export interface EvaluatedSkill extends ActiveSkillManifest {
  evaluation: {
    resolvedUses: number;
    score: number | null;
    confidence: "low" | "medium" | "high";
    label: "unproven" | "promising" | "stable" | "watch" | "retired";
  };
}

interface ProposalStore {
  version: 1;
  proposals: SkillProposal[];
}

function atomicWrite(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, content, "utf-8");
  renameSync(temp, file);
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function skillDir(name: string): string {
  return path.join(SKILLS_DIR, name);
}

function skillFile(name: string): string {
  return path.join(skillDir(name), "SKILL.md");
}

function manifestFile(name: string): string {
  return path.join(skillDir(name), "skill.json");
}

function validateName(name: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64
    ? null
    : "Skill name must be lowercase kebab-case and at most 64 characters.";
}

function validateContent(name: string, description: string, content: string): string[] {
  const errors: string[] = [];
  const nameError = validateName(name);
  if (nameError) errors.push(nameError);
  if (!description.trim() || description.length > 240) errors.push("Description must be 1-240 characters.");
  if (!content.trim() || content.length > MAX_SKILL_CHARS) errors.push(`Skill body must be 1-${MAX_SKILL_CHARS} characters.`);
  return errors;
}

/** Conservative scan for secrets, destructive commands, and permission bypasses. */
export function scanSkillContent(content: string): string[] {
  const checks: Array<[RegExp, string]> = [
    [/\b(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,})\b/, "Possible API key embedded in skill"],
    [/(?:^|\s)(?:rm\s+-rf|Remove-Item\s+.*-Recurse|del\s+\/s)(?:\s|$)/im, "Destructive filesystem command"],
    [/--dangerously-skip-permissions|--no-sandbox/i, "Permission or sandbox bypass"],
    [/(?:curl|wget).{0,120}\|\s*(?:sh|bash|powershell)/i, "Remote download piped into a shell"],
    [/\.env\b.{0,80}(?:read|print|send|upload|copy)/i, "Instruction may expose environment secrets"],
  ];
  return checks.filter(([pattern]) => pattern.test(content)).map(([, finding]) => finding);
}

function loadStore(): ProposalStore {
  try {
    if (existsSync(PROPOSALS_FILE)) {
      const parsed = JSON.parse(readFileSync(PROPOSALS_FILE, "utf-8")) as ProposalStore;
      if (parsed?.version === 1 && Array.isArray(parsed.proposals)) return parsed;
    }
  } catch (err) {
    console.warn("[Skills] Proposal store unreadable:", (err as Error).message);
  }
  return { version: 1, proposals: [] };
}

function saveStore(store: ProposalStore): void {
  atomicWrite(PROPOSALS_FILE, JSON.stringify(store, null, 2));
}

function readActiveManifest(name: string): ActiveSkillManifest | null {
  try {
    if (!existsSync(manifestFile(name))) return null;
    const stored = JSON.parse(readFileSync(manifestFile(name), "utf-8")) as Partial<ActiveSkillManifest>;
    if (!stored.name || !stored.description || !stored.content || !stored.sourceProposalId) return null;
    return {
      name: stored.name,
      description: stored.description,
      content: stored.content,
      sourceProposalId: stored.sourceProposalId,
      createdAt: stored.createdAt || localTimestamp(),
      updatedAt: stored.updatedAt || stored.createdAt || localTimestamp(),
      status: stored.status || "active",
      useCount: stored.useCount || 0,
      lastUsedAt: stored.lastUsedAt || null,
      successCount: stored.successCount || 0,
      partialCount: stored.partialCount || 0,
      failureCount: stored.failureCount || 0,
      unknownCount: stored.unknownCount || 0,
      lastOutcomeAt: stored.lastOutcomeAt || null,
      retiredAt: stored.retiredAt || null,
      retirementReason: stored.retirementReason || null,
    };
  } catch {
    return null;
  }
}

function activeHash(name: string): string | null {
  try {
    return existsSync(skillFile(name)) ? hash(readFileSync(skillFile(name), "utf-8")) : null;
  } catch {
    return null;
  }
}

function renderSkill(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`;
}

export function createSkillProposal(input: {
  name: string;
  description: string;
  body: string;
  evidence?: string;
  templateName?: string;
  templateContent?: string;
}): SkillProposal {
  const name = input.name.trim().toLowerCase();
  const description = input.description.trim();
  const content = renderSkill(name, description, input.body);
  const validation = validateContent(name, description, content);
  if (validation.length > 0) throw new Error(validation.join(" "));
  if (input.templateName && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(input.templateName)) {
    throw new Error("Template name must be a simple filename without directories.");
  }

  const store = loadStore();
  if (store.proposals.filter((p) => p.status === "pending" || p.status === "quarantined").length >= MAX_PENDING) {
    throw new Error(`Skill proposal limit reached (${MAX_PENDING}). Review pending proposals first.`);
  }

  const findings = scanSkillContent(`${content}\n${input.templateContent || ""}`);
  const now = localTimestamp();
  const proposal: SkillProposal = {
    id: `skill_${randomUUID()}`,
    name,
    description,
    kind: existsSync(skillFile(name)) ? "update" : "create",
    status: findings.length > 0 ? "quarantined" : "pending",
    content,
    templateName: input.templateName,
    templateContent: input.templateContent,
    evidence: input.evidence?.trim() ? [input.evidence.trim().slice(0, 1000)] : [],
    targetHash: activeHash(name),
    scannerFindings: findings,
    createdAt: now,
    updatedAt: now,
  };
  store.proposals.push(proposal);
  saveStore(store);
  return proposal;
}

export function listSkillProposals(status?: ProposalStatus): SkillProposal[] {
  return loadStore().proposals
    .filter((proposal) => !status || proposal.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSkillProposal(id: string): SkillProposal | null {
  return loadStore().proposals.find((proposal) => proposal.id === id) || null;
}

export function applySkillProposal(id: string): SkillProposal {
  const store = loadStore();
  const proposal = store.proposals.find((item) => item.id === id);
  if (!proposal) throw new Error("Skill proposal not found.");
  if (proposal.status !== "pending") throw new Error(`Only pending proposals can be applied (current: ${proposal.status}).`);

  const currentHash = activeHash(proposal.name);
  if (currentHash !== proposal.targetHash) {
    proposal.status = "stale";
    proposal.updatedAt = localTimestamp();
    saveStore(store);
    throw new Error("The active skill changed after this proposal was created. Proposal marked stale.");
  }

  const findings = scanSkillContent(`${proposal.content}\n${proposal.templateContent || ""}`);
  if (findings.length > 0) {
    proposal.status = "quarantined";
    proposal.scannerFindings = findings;
    proposal.updatedAt = localTimestamp();
    saveStore(store);
    throw new Error(`Security scan blocked apply: ${findings.join(", ")}`);
  }

  const rollbackDir = path.join(SKILL_WORKSHOP_DIR, "proposals", proposal.id);
  mkdirSync(rollbackDir, { recursive: true });
  const previousContent = existsSync(skillFile(proposal.name))
    ? readFileSync(skillFile(proposal.name), "utf-8")
    : null;
  const previousTemplatePath = proposal.templateName
    ? path.join(skillDir(proposal.name), "templates", proposal.templateName)
    : null;
  atomicWrite(path.join(rollbackDir, "rollback.json"), JSON.stringify({
    skill: proposal.name,
    previousContent,
    previousManifest: readActiveManifest(proposal.name),
    templateName: proposal.templateName || null,
    previousTemplateContent: previousTemplatePath && existsSync(previousTemplatePath)
      ? readFileSync(previousTemplatePath, "utf-8")
      : null,
    appliedAt: localTimestamp(),
  }, null, 2));

  mkdirSync(skillDir(proposal.name), { recursive: true });
  atomicWrite(skillFile(proposal.name), proposal.content);
  if (proposal.templateName && proposal.templateContent != null) {
    atomicWrite(path.join(skillDir(proposal.name), "templates", proposal.templateName), proposal.templateContent);
  }

  const previousManifest = readActiveManifest(proposal.name);
  const now = localTimestamp();
  const manifest: ActiveSkillManifest = {
    name: proposal.name,
    description: proposal.description,
    content: proposal.content.replace(/^---[\s\S]*?---\s*/, "").trim(),
    sourceProposalId: proposal.id,
    createdAt: previousManifest?.createdAt || now,
    updatedAt: now,
    status: "active",
    useCount: 0,
    lastUsedAt: null,
    successCount: 0,
    partialCount: 0,
    failureCount: 0,
    unknownCount: 0,
    lastOutcomeAt: null,
    retiredAt: null,
    retirementReason: null,
  };
  atomicWrite(manifestFile(proposal.name), JSON.stringify(manifest, null, 2));

  proposal.status = "applied";
  proposal.appliedAt = now;
  proposal.updatedAt = now;
  saveStore(store);
  return proposal;
}

export function rejectSkillProposal(id: string): SkillProposal {
  const store = loadStore();
  const proposal = store.proposals.find((item) => item.id === id);
  if (!proposal) throw new Error("Skill proposal not found.");
  if (proposal.status !== "pending" && proposal.status !== "quarantined") {
    throw new Error(`Cannot reject proposal in ${proposal.status} state.`);
  }
  proposal.status = "rejected";
  proposal.rejectedAt = localTimestamp();
  proposal.updatedAt = proposal.rejectedAt;
  saveStore(store);
  return proposal;
}

export function rollbackSkillProposal(id: string): SkillProposal {
  const store = loadStore();
  const proposal = store.proposals.find((item) => item.id === id);
  if (!proposal || proposal.status !== "applied") throw new Error("Applied proposal not found.");
  const rollbackFile = path.join(SKILL_WORKSHOP_DIR, "proposals", proposal.id, "rollback.json");
  if (!existsSync(rollbackFile)) throw new Error("Rollback metadata is missing.");
  const rollback = JSON.parse(readFileSync(rollbackFile, "utf-8")) as {
    previousContent: string | null;
    previousManifest: ActiveSkillManifest | null;
    templateName?: string | null;
    previousTemplateContent?: string | null;
  };

  if (rollback.previousContent == null) {
    rmSync(skillDir(proposal.name), { recursive: true, force: true });
  } else {
    atomicWrite(skillFile(proposal.name), rollback.previousContent);
    if (rollback.previousManifest) {
      atomicWrite(manifestFile(proposal.name), JSON.stringify(rollback.previousManifest, null, 2));
    }
    if (rollback.templateName) {
      const target = path.join(skillDir(proposal.name), "templates", rollback.templateName);
      if (rollback.previousTemplateContent == null) {
        rmSync(target, { force: true });
      } else {
        atomicWrite(target, rollback.previousTemplateContent);
      }
    }
  }
  proposal.status = "rolled_back";
  proposal.rolledBackAt = localTimestamp();
  proposal.updatedAt = proposal.rolledBackAt;
  saveStore(store);
  return proposal;
}

export function listActiveSkills(): ActiveSkillManifest[] {
  return listSkillManifests().filter((skill) => skill.status === "active");
}

export function listSkillManifests(): ActiveSkillManifest[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readActiveManifest(entry.name))
    .filter((skill): skill is ActiveSkillManifest => Boolean(skill));
}

function evaluateSkill(skill: ActiveSkillManifest): EvaluatedSkill {
  const resolvedUses = skill.successCount + skill.partialCount + skill.failureCount;
  const score = resolvedUses > 0
    ? Math.round(((skill.successCount + skill.partialCount * 0.5) / resolvedUses) * 100)
    : null;
  const confidence = resolvedUses >= 12 ? "high" : resolvedUses >= 5 ? "medium" : "low";
  let label: EvaluatedSkill["evaluation"]["label"] = "unproven";
  if (skill.status === "retired") label = "retired";
  else if (resolvedUses >= 5 && score != null && score < 50) label = "watch";
  else if (resolvedUses >= 5 && score != null && score >= 80) label = "stable";
  else if (resolvedUses > 0 && score != null && score >= 60) label = "promising";
  return { ...skill, evaluation: { resolvedUses, score, confidence, label } };
}

export function listEvaluatedSkills(): EvaluatedSkill[] {
  return listSkillManifests()
    .map(evaluateSkill)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
}

export function buildProceduralSkillContextWithUsage(
  message: string,
  maxChars = 3000
): { context: string; skills: string[] } {
  const queryTokens = tokens(message);
  const ranked = listActiveSkills()
    .map((skill) => {
      const skillTokens = tokens(`${skill.name} ${skill.description} ${skill.content}`);
      const overlap = [...queryTokens].filter((token) => skillTokens.has(token)).length;
      const alwaysRelevant = skill.name === "friday-user-preferences" ? 100 : 0;
      return { skill, score: overlap + alwaysRelevant };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) return { context: "", skills: [] };
  const blocks: string[] = [];
  const usedSkills: string[] = [];
  let used = 0;
  for (const { skill } of ranked) {
    const block = `[${skill.name}] ${skill.description}\n${skill.content}`;
    if (used + block.length > maxChars) break;
    blocks.push(block);
    usedSkills.push(skill.name);
    used += block.length;
    skill.useCount++;
    skill.lastUsedAt = localTimestamp();
    atomicWrite(manifestFile(skill.name), JSON.stringify(skill, null, 2));
  }
  return {
    context: blocks.length
      ? `\n\nACTIVE PROCEDURAL SKILLS (follow when relevant):\n${blocks.join("\n---\n")}`
      : "",
    skills: usedSkills,
  };
}

export function buildProceduralSkillContext(message: string, maxChars = 3000): string {
  return buildProceduralSkillContextWithUsage(message, maxChars).context;
}

/** Attach execution outcomes to the procedures that influenced a turn. */
export function recordProceduralSkillOutcome(names: string[], outcome: ProceduralOutcome): void {
  const uniqueNames = [...new Set(names)];
  for (const name of uniqueNames) {
    const skill = readActiveManifest(name);
    if (!skill || skill.status !== "active") continue;
    if (outcome === "success") skill.successCount++;
    else if (outcome === "partial") skill.partialCount++;
    else if (outcome === "failure") skill.failureCount++;
    else skill.unknownCount++;
    skill.lastOutcomeAt = localTimestamp();

    const resolvedUses = skill.successCount + skill.partialCount + skill.failureCount;
    const score = resolvedUses > 0
      ? (skill.successCount + skill.partialCount * 0.5) / resolvedUses
      : 1;
    if (resolvedUses >= 8 && score < 0.25) {
      skill.status = "retired";
      skill.retiredAt = localTimestamp();
      skill.retirementReason = `Automatically retired after ${resolvedUses} measured uses with a ${Math.round(score * 100)}% outcome score.`;
    }
    atomicWrite(manifestFile(skill.name), JSON.stringify(skill, null, 2));
  }
}

/** Draft, but never apply, a durable preference learned from a direct correction. */
export function captureCorrectionProposal(message: string): SkillProposal | null {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!/\b(that(?:'s| is) wrong|not what i asked|you misunderstood|don't do that|stop doing|next time|from now on|i prefer|please always|please never)\b/i.test(trimmed)) {
    return null;
  }
  const store = loadStore();
  const duplicate = store.proposals.find((proposal) =>
    proposal.name === "friday-user-preferences" &&
    (proposal.status === "pending" || proposal.status === "applied") &&
    proposal.evidence.some((item) => item.toLowerCase() === trimmed.toLowerCase())
  );
  if (duplicate) return duplicate;

  const pending = store.proposals.find((proposal) =>
    proposal.name === "friday-user-preferences" && proposal.status === "pending"
  );
  if (pending) {
    const body = pending.content.replace(/^---[\s\S]*?---\s*/, "").trim();
    pending.content = renderSkill(
      pending.name,
      pending.description,
      `${body}\n\n## Additional proposed rule\n\n- ${trimmed}`
    );
    pending.evidence.push(trimmed.slice(0, 1000));
    pending.updatedAt = localTimestamp();
    pending.scannerFindings = scanSkillContent(pending.content);
    pending.status = pending.scannerFindings.length ? "quarantined" : "pending";
    saveStore(store);
    return pending;
  }

  const active = readActiveManifest("friday-user-preferences");
  const prior = active?.content || "# Friday User Preferences\n\nApply these durable interaction preferences in every relevant conversation.";
  return createSkillProposal({
    name: "friday-user-preferences",
    description: "Durable corrections and interaction preferences learned from Danny.",
    body: `${prior.trim()}\n\n## Proposed learned rule\n\n- ${trimmed}`,
    evidence: trimmed,
  });
}
