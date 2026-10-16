// Self-repair queue. A fix is attempted on a new branch. Merge and push
// happen only after Danny approves, and never into main or master.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawn } from "node:child_process";
import { gitResetHardArgs } from "../agents/command.js";
import {
  canMergeInto,
  fixTaskPrompt,
  isFixBranch,
  rateLimitDecision,
  repairBranchName,
  secretPaths,
} from "./guards.js";

export type RepairStatus =
  | "running"
  | "needs_approval"
  | "pushed"
  | "rejected"
  | "merged"
  | "rolled_back"
  | "blocked"
  | "failed";

export interface Repair {
  id: string;
  createdAt: string;
  status: RepairStatus;
  summary: string;
  branch: string;
  baseBranch: string;
  baseSha: string;
  agent: string;
  mergeAllowed: boolean;
  testSummary: string;
  detail: string;
}

export interface GitOps {
  statusPorcelain(): Promise<string>;
  currentBranch(): Promise<string>;
  headSha(): Promise<string>;
  checkoutNew(branch: string): Promise<void>;
  checkout(branch: string): Promise<void>;
  diffNames(baseSha: string): Promise<string[]>;
  commitIfNeeded(message: string): Promise<void>;
  merge(branch: string): Promise<void>;
  resetHard(sha: string): Promise<void>;
  push(branch: string): Promise<void>;
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  worktreeAdd(sha: string): Promise<string>;
  worktreeRemove(dir: string): Promise<void>;
  mergeIn(dir: string, branch: string): Promise<void>;
  revertMerge(): Promise<void>;
}

export interface RepairDeps {
  now?: () => Date;
  storeFile: string;
  git: GitOps;
  listAgents: () => Promise<Array<{ id: string; canDispatch: boolean }>>;
  dispatch: (agentId: string, task: string) => Promise<{ ok: boolean; summary: string }>;
  runTests: () => Promise<{ ok: boolean; summary: string }>;
  runHealth: (cwd?: string) => Promise<{ ok: boolean; summary: string }>;
}

interface Store {
  repairs: Repair[];
}

function load(file: string): Store {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Store;
  } catch {
    // A corrupt queue is safer empty than half-merged.
  }
  return { repairs: [] };
}

function save(file: string, store: Store): void {
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createRepairService(deps: RepairDeps) {
  const now = deps.now ?? (() => new Date());

  function list(): Repair[] {
    return load(deps.storeFile).repairs.slice().reverse();
  }

  async function start(summary: string): Promise<Repair> {
    const store = load(deps.storeFile);
    const today = dayKey(now());
    const attemptsToday = store.repairs.filter((item) => item.createdAt.slice(0, 10) === today && item.status !== "blocked").length;
    const inFlight = store.repairs.filter((item) => item.status === "running" || item.status === "needs_approval").length;
    const limit = rateLimitDecision({ attemptsToday, inFlight });
    const branch = repairBranchName(summary, now());
    const blocked = (status: RepairStatus, detail: string, baseBranch = "", baseSha = ""): Repair => {
      const repair: Repair = {
        id: `repair-${Date.now()}`,
        createdAt: now().toISOString(),
        status,
        summary,
        branch,
        baseBranch,
        baseSha,
        agent: "",
        mergeAllowed: false,
        testSummary: "",
        detail,
      };
      store.repairs.push(repair);
      save(deps.storeFile, store);
      return repair;
    };

    if (!limit.ok) return blocked("blocked", limit.reason);
    const dirty = (await deps.git.statusPorcelain()).trim();
    if (dirty) return blocked("blocked", "Working tree is dirty. Repair waits so your edits are not mixed in.");

    const baseBranch = await deps.git.currentBranch();
    const baseSha = await deps.git.headSha();
    const agents = await deps.listAgents();
    const agent = agents.find((item) => item.id === "codex" && item.canDispatch);
    if (!agent) return blocked("blocked", "Codex is offline. Nothing was branched.", baseBranch, baseSha);

    const repair: Repair = {
      id: `repair-${Date.now()}`,
      createdAt: now().toISOString(),
      status: "running",
      summary,
      branch,
      baseBranch,
      baseSha,
      agent: agent.id,
      mergeAllowed: canMergeInto(baseBranch).ok,
      testSummary: "",
      detail: "Dispatched.",
    };
    store.repairs.push(repair);
    save(deps.storeFile, store);

    try {
      await deps.git.checkoutNew(branch);
      const dispatched = await deps.dispatch(agent.id, fixTaskPrompt(branch, summary));
      const names = await deps.git.diffNames(baseSha);
      const secrets = secretPaths(names);
      if (secrets.length > 0) {
        await deps.git.resetHard(baseSha);
        await deps.git.checkout(baseBranch);
        repair.status = "blocked";
        repair.detail = `Stopped. The fix touched secrets: ${secrets.join(", ")}`;
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      if (!dispatched.ok) {
        await deps.git.checkout(baseBranch);
        repair.status = "failed";
        repair.detail = dispatched.summary;
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      await deps.git.commitIfNeeded(`Friday fix: ${summary}`.slice(0, 72));
      const tests = await deps.runTests();
      repair.testSummary = tests.summary;
      await deps.git.checkout(baseBranch);
      if (!tests.ok) {
        repair.status = "failed";
        repair.detail = "Tests failed. The branch was left in place and not merged.";
      } else {
        repair.status = "needs_approval";
        repair.detail = repair.mergeAllowed
          ? "Tests passed. Approve to merge this branch, or Reject to leave it."
          : "Tests passed. Approve pushes the fix branch only. Main is not merged.";
      }
    } catch (err) {
      repair.status = "failed";
      repair.detail = (err as Error).message || "Repair failed.";
      try { await deps.git.checkout(repair.baseBranch); } catch { /* already away */ }
    }
    save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
    return repair;
  }

  async function approve(id: string): Promise<Repair> {
    const repair = find(deps.storeFile, id);
    if (repair.status !== "needs_approval") {
      repair.detail = "Only a repair waiting for approval can be approved.";
      return repair;
    }
    if (!isFixBranch(repair.branch)) {
      repair.status = "blocked";
      repair.detail = "Refusing to push a branch Friday did not create.";
      save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
      return repair;
    }
    const merge = canMergeInto(repair.baseBranch);
    let worktree = "";
    let mergedToBranch = false;
    try {
      const dirty = (await deps.git.statusPorcelain()).trim();
      if (dirty) {
        repair.status = "blocked";
        repair.detail = "Working tree is dirty. The approved repair was not merged.";
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      const here = await deps.git.currentBranch();
      if (here !== repair.baseBranch) {
        repair.status = "blocked";
        repair.detail = `Checked out ${here}, not ${repair.baseBranch}. Nothing was merged.`;
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      const pre = await deps.git.headSha();
      const contains = pre === repair.baseSha || (await deps.git.isAncestor(repair.baseSha, pre));
      if (!contains) {
        repair.status = "blocked";
        repair.detail = "The approved base revision is no longer in this branch. Nothing was merged.";
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      await deps.git.push(repair.branch);
      if (!merge.ok) {
        repair.status = "pushed";
        repair.detail = `${merge.reason} The fix branch was pushed. Main was not touched.`;
        repair.mergeAllowed = false;
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      worktree = await deps.git.worktreeAdd(pre);
      await deps.git.mergeIn(worktree, repair.branch);
      const health = await deps.runHealth(worktree);
      if (!health.ok) {
        await deps.git.worktreeRemove(worktree);
        worktree = "";
        repair.status = "rolled_back";
        repair.detail = `Health failed (${health.summary}). The repair merge stayed in a worktree and was discarded. ${repair.baseBranch} was not reset.`;
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      const again = await deps.git.headSha();
      if (again !== pre) {
        await deps.git.worktreeRemove(worktree);
        worktree = "";
        repair.status = "failed";
        repair.detail = "The base branch moved while health ran. The repair was not merged.";
        save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
        return repair;
      }
      await deps.git.merge(repair.branch);
      mergedToBranch = true;
      await deps.git.worktreeRemove(worktree);
      worktree = "";
      repair.status = "merged";
      repair.detail = `Merged into ${repair.baseBranch}. ${health.summary}`;
    } catch (err) {
      if (worktree) {
        try { await deps.git.worktreeRemove(worktree); } catch { /* the branch rollback still matters */ }
      }
      if (mergedToBranch) {
        try {
          await deps.git.revertMerge();
          repair.status = "rolled_back";
          repair.detail = `The repair merge was reverted. ${(err as Error).message || "Approve failed."}`;
        } catch (revertErr) {
          repair.status = "failed";
          repair.detail = `The repair merge landed and revert failed. The branch was not hard-reset. ${(revertErr as Error).message}`;
        }
      } else {
        repair.status = "failed";
        repair.detail = (err as Error).message || "Approve failed.";
      }
    }
    save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
    return repair;
  }

  function reject(id: string): Repair {
    const repair = find(deps.storeFile, id);
    if (repair.status !== "needs_approval") {
      repair.detail = "Only a repair waiting for approval can be rejected.";
      return repair;
    }
    repair.status = "rejected";
    repair.detail = "Rejected. The branch was not merged and was not pushed.";
    save(deps.storeFile, loadAndReplace(deps.storeFile, repair));
    return repair;
  }

  return { list, start, approve, reject };
}

function find(file: string, id: string): Repair {
  const store = load(file);
  const repair = store.repairs.find((item) => item.id === id);
  if (!repair) {
    return {
      id,
      createdAt: "",
      status: "failed",
      summary: "",
      branch: "",
      baseBranch: "",
      baseSha: "",
      agent: "",
      mergeAllowed: false,
      testSummary: "",
      detail: "No repair with that id.",
    };
  }
  return repair;
}

function loadAndReplace(file: string, repair: Repair): Store {
  const store = load(file);
  const index = store.repairs.findIndex((item) => item.id === repair.id);
  if (index >= 0) store.repairs[index] = repair;
  return store;
}

export function gitOps(cwd: string): GitOps {
  const git = (args: string[]) => runGit(cwd, args);
  return {
    statusPorcelain: async () => (await git(["status", "--porcelain"])).stdout,
    currentBranch: async () => (await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(),
    headSha: async () => (await git(["rev-parse", "HEAD"])).stdout.trim(),
    checkoutNew: async (branch) => {
      if (!isFixBranch(branch)) throw new Error("Refusing to create a branch outside friday/fix-.");
      await git(["checkout", "-b", branch]);
    },
    checkout: async (branch) => {
      if (branch.startsWith("-") || branch.includes("..")) throw new Error("Unsafe branch name.");
      await git(["checkout", branch]);
    },
    diffNames: async (baseSha) => {
      const tracked = await git(["diff", "--name-only", baseSha]);
      const untracked = await git(["ls-files", "--others", "--exclude-standard"]);
      return [...tracked.stdout.split("\n"), ...untracked.stdout.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean);
    },
    commitIfNeeded: async (message) => {
      const status = (await git(["status", "--porcelain"])).stdout;
      const files = status.split("\n").map((line) => line.slice(3).trim()).filter(Boolean);
      const secrets = secretPaths(files);
      if (secrets.length > 0) throw new Error(`Refusing to commit secrets: ${secrets.join(", ")}`);
      if (!status.trim()) return;
      await git(["add", "-A"]);
      await git(["commit", "-m", message]);
    },
    merge: async (branch) => {
      if (!isFixBranch(branch)) throw new Error("Refusing to merge a branch Friday did not create.");
      await git(["merge", "--no-ff", "--no-edit", branch]);
    },
    resetHard: async (sha) => {
      await git(gitResetHardArgs(sha));
    },
    push: async (branch) => {
      if (!isFixBranch(branch)) throw new Error("Refusing to push anything except a friday/fix- branch.");
      await git(["push", "-u", "origin", branch]);
    },
    isAncestor: async (ancestor, descendant) => {
      if (!/^[0-9a-f]{7,40}$/i.test(ancestor) || !/^[0-9a-f]{7,40}$/i.test(descendant)) return false;
      if (ancestor === descendant) return true;
      try {
        await git(["merge-base", "--is-ancestor", ancestor, descendant]);
        return true;
      } catch {
        return false;
      }
    },
    worktreeAdd: async (sha) => {
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error("Refusing to check out an unexpected sha.");
      const dir = mkdtempSync(path.join(tmpdir(), "friday-repair-"));
      try {
        await git(["worktree", "add", "--detach", dir, sha]);
      } catch (err) {
        rmSync(dir, { recursive: true, force: true });
        throw err;
      }
      return dir;
    },
    worktreeRemove: async (dir) => {
      if (!dir.includes(`${path.sep}friday-repair-`)) throw new Error("Refusing to remove an unexpected worktree.");
      await git(["worktree", "remove", "--force", dir]);
    },
    mergeIn: async (dir, branch) => {
      if (!dir.includes(`${path.sep}friday-repair-`)) throw new Error("Refusing to merge outside a repair worktree.");
      if (!isFixBranch(branch)) throw new Error("Refusing to merge a branch Friday did not create.");
      await runGit(dir, ["merge", "--no-ff", "--no-edit", branch]);
    },
    revertMerge: async () => {
      await git(["revert", "-m", "1", "--no-edit", "HEAD"]);
    },
  };
}

function runGit(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `git ${args[0]} exited ${code}`));
      else resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}
