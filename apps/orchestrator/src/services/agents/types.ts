// Adapter surface for the HUD agent panel. Every method must resolve;
// a missing credential or binary is an offline status, never an exception.

export type AgentKind = "grok-bot" | "codex" | "claude-code" | "xai-grok";
export type AgentState = "online" | "offline" | "degraded";

export interface AgentStatus {
  id: string;
  name: string;
  kind: AgentKind;
  state: AgentState;
  detail: string;
  /** Grok bots render as status dots; CLI/API backends render as rows. */
  render: "dot" | "row";
  canDispatch: boolean;
}

export interface DispatchRequest {
  task: string;
  workingDirectory?: string;
  /** Claude model alias: fable | opus | sonnet | haiku. Ignored by other adapters. */
  model?: string;
  timeoutMs?: number;
}

export interface DispatchResult {
  ok: boolean;
  state: AgentState;
  summary: string;
  output?: string;
}

export interface AgentAdapter {
  id: string;
  kind: AgentKind;
  list(): Promise<AgentStatus[]>;
  dispatch(id: string, request: DispatchRequest): Promise<DispatchResult>;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  timedOut?: boolean;
}

export interface CommandRunner {
  (
    cmd: string,
    args: string[],
    opts: { cwd?: string; input?: string; timeoutMs: number }
  ): Promise<CommandResult>;
}

export interface AgentDeps {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  run: CommandRunner;
}
