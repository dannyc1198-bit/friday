// Pluggable coding backend for voice. Codex and Grok go through the existing
// agent dispatcher. Ollama and LM Studio speak the OpenAI chat format on a
// local URL. Nothing here edits files. applyApprovedChange is the only writer,
// and it refuses every branch except voice/* and has no push.

export interface CodingProposal {
  ok: boolean;
  summary: string;
  diff: string;
  detail: string;
  needsKey?: boolean;
}

export interface CodingBackend {
  id: string;
  status(): Promise<{ ready: boolean; needsKey: boolean; detail: string }>;
  propose(task: string): Promise<CodingProposal>;
}

export interface CodingChoice {
  id: "codex" | "xai-grok" | "openai-compatible";
  baseUrl: string;
  model: string;
}

export interface GitOps {
  currentBranch(): Promise<string>;
  checkoutNew(branch: string): Promise<void>;
  applyDiff(diff: string): Promise<void>;
  commit(message: string): Promise<void>;
  /** Tests pass this to prove apply never pushes. Production git omits it. */
  push?: () => Promise<unknown>;
}

export interface ApprovedChange {
  branch: string;
  diff: string;
  message: string;
}

const OLLAMA = "http://127.0.0.1:11434/v1";
const LM_STUDIO = "http://127.0.0.1:1234/v1";
const PROTECTED = new Set(["main", "master", "simple-friday"]);

const PLAN_RULES = [
  "Do not edit files. Do not run git. Do not push.",
  "Do not send messages or spend money.",
  "Reply with JSON only: {\"summary\":\"one or two sentences I can say out loud\",\"diff\":\"unified diff or empty string\"}",
].join(" ");

export function selectCodingBackend(env: NodeJS.ProcessEnv): CodingChoice {
  const raw = (env.VOICE_CODING_BACKEND || "auto").trim().toLowerCase();
  const model = env.VOICE_CODING_MODEL?.trim() || "local";
  const custom = (env.VOICE_CODING_BASE_URL || "").trim().replace(/\/$/, "");
  if (raw === "codex") return { id: "codex", baseUrl: "", model: "" };
  if (raw === "xai-grok" || raw === "grok") return { id: "xai-grok", baseUrl: "", model: "" };
  if (raw === "ollama") return { id: "openai-compatible", baseUrl: custom || OLLAMA, model };
  if (raw === "lmstudio" || raw === "lm-studio") return { id: "openai-compatible", baseUrl: custom || LM_STUDIO, model };
  if (raw === "openai-compatible" || raw === "local") {
    return { id: "openai-compatible", baseUrl: custom || OLLAMA, model };
  }
  if (custom) return { id: "openai-compatible", baseUrl: custom, model };
  return { id: "codex", baseUrl: "", model: "" };
}

export function voiceBranchName(task: string, stamp: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return `voice/${slug || "change"}-${stamp}`;
}

export function branchProblem(branch: string): string | null {
  const name = branch.trim();
  if (!name.startsWith("voice/") || PROTECTED.has(name) || name.includes("..") || /\s/.test(name)) {
    return "I only commit on a voice/ branch. I will not use main, and I will not push.";
  }
  return null;
}

export async function applyApprovedChange(
  git: GitOps,
  input: ApprovedChange
): Promise<{ ok: boolean; branch: string; say: string }> {
  const branch = input.branch.trim();
  const problem = branchProblem(branch);
  if (problem) return { ok: false, branch, say: problem };
  if (!input.diff.trim()) {
    return { ok: false, branch, say: "There is no diff to apply, so I did not commit." };
  }
  await git.checkoutNew(branch);
  await git.applyDiff(input.diff);
  await git.commit(input.message);
  return { ok: true, branch, say: `Applied on ${branch}. I did not push.` };
}

export function createOpenAiCompatibleBackend(options: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchImpl: typeof fetch;
}): CodingBackend {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  return {
    id: "openai-compatible",
    async status() {
      if (!baseUrl) {
        return { ready: false, needsKey: false, detail: "Set VOICE_CODING_BASE_URL to an Ollama or LM Studio server." };
      }
      return { ready: true, needsKey: false, detail: `${options.model} at ${baseUrl}` };
    },
    async propose(task: string): Promise<CodingProposal> {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (options.apiKey?.trim()) headers.Authorization = `Bearer ${options.apiKey.trim()}`;
        const response = await options.fetchImpl(completionsUrl(baseUrl), {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: options.model,
            temperature: 0.2,
            messages: [
              { role: "system", content: PLAN_RULES },
              { role: "user", content: task },
            ],
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (response.status === 401) {
          return { ok: false, summary: "", diff: "", needsKey: true, detail: "needs key — the coding endpoint refused the request" };
        }
        if (!response.ok) {
          return { ok: false, summary: "", diff: "", detail: `Coding endpoint HTTP ${response.status}` };
        }
        const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = body.choices?.[0]?.message?.content || "";
        const parsed = parseProposal(content);
        if (!parsed.summary && !parsed.diff) {
          return { ok: false, summary: "", diff: "", detail: "The coding model returned an empty plan." };
        }
        return { ok: true, summary: parsed.summary || "I have a plan.", diff: parsed.diff, detail: "" };
      } catch (err) {
        return { ok: false, summary: "", diff: "", detail: (err as Error).message || "coding endpoint offline" };
      }
    },
  };
}

export function createDispatchCodingBackend(
  id: string,
  dispatch: (task: string) => Promise<{ ok: boolean; summary: string; output?: string }>
): CodingBackend {
  return {
    id,
    async status() {
      return { ready: true, needsKey: false, detail: id };
    },
    async propose(task: string): Promise<CodingProposal> {
      try {
        const result = await dispatch(`${PLAN_RULES}\nTask:\n${task}`);
        if (!result.ok) {
          const needsKey = /needs key|api_key|not set/i.test(result.summary);
          return { ok: false, summary: "", diff: "", detail: result.summary, needsKey };
        }
        const parsed = parseProposal(result.output || result.summary);
        return {
          ok: true,
          summary: parsed.summary || result.summary.slice(0, 400) || "I have a plan.",
          diff: parsed.diff,
          detail: "",
        };
      } catch (err) {
        return { ok: false, summary: "", diff: "", detail: (err as Error).message || "coding backend offline" };
      }
    },
  };
}

export function parseProposal(raw: string): { summary: string; diff: string } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(raw.slice(start, end + 1)) as { summary?: unknown; diff?: unknown };
      return {
        summary: typeof data.summary === "string" ? data.summary.trim() : "",
        diff: typeof data.diff === "string" ? data.diff : "",
      };
    } catch {
      /* prose fallback below */
    }
  }
  return { summary: raw.trim().slice(0, 400), diff: "" };
}

function completionsUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/chat/completions")) return baseUrl;
  return `${baseUrl}/chat/completions`;
}
