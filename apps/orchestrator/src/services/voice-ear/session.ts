// One spoken turn. Fast intents run immediately. Destructive speech, clicks,
// and code changes wait for a spoken yes. Code still is not pushed.

import {
  applyApprovedChange,
  voiceBranchName,
  type CodingBackend,
  type GitOps,
} from "./coding.js";
import { decisionFromBrain, isApproval, isRefusal, routeVoiceIntent, type VoiceIntent } from "./intent.js";
import { notifyEar } from "./live.js";
import { planFromTranscript, spokenSummary, stepsFromBrain } from "./voice-plan.js";
import type { YoutubeHit, YoutubeResult } from "./youtube.js";

export interface ToolOutcome {
  ok: boolean;
  message: string;
}

export interface VoiceEarDeps {
  allowedApps: string[];
  stamp?: () => string;
  resolveYouTube: (query: string) => Promise<YoutubeResult>;
  openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
  runTool: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;
  coding?: CodingBackend;
  git?: GitOps;
  brain?: (text: string) => Promise<string>;
  computerUse?: boolean;
  click?: (x: number, y: number) => Promise<ToolOutcome>;
  wakeWord?: string;
}

export interface VoiceTurn {
  say: string;
  acted: boolean;
  needsKey?: boolean;
}

export interface SpeechCue {
  id: string;
  text: string;
  playback: "pending" | "playing" | "done" | "local";
}

export interface EarLine {
  role: "you" | "jarvis";
  text: string;
}

export interface EarStatus {
  phase: "asleep" | "listening" | "thinking" | "speaking" | "confirming" | "muted" | "alert";
  wakeWord: string;
  muted: boolean;
  heard: string;
  say: string;
  pending: { kind: string; summary: string } | null;
  nowPlaying: YoutubeHit | null;
  codingBackend: string;
  micLevel: number;
  alert: string | null;
  transcript: EarLine[];
  speech: SpeechCue | null;
  armed: boolean;
  settingsOpen: boolean;
  theme: "jarvis" | "ultron";
  sensitivity: number;
  followSeconds: number;
  followUntil: number;
}

type Pending =
  | { kind: "destructive"; summary: string; tool?: string; args?: Record<string, unknown>; after: VoiceIntent[] }
  | { kind: "computer"; summary: string; intent: Extract<VoiceIntent, { kind: "computer" }> }
  | { kind: "coding"; summary: string; diff: string; branch: string; message: string };

export function createVoiceEar(deps: VoiceEarDeps) {
  const allowed = new Set(deps.allowedApps.map((name) => name.toLowerCase().trim()));
  let phase: EarStatus["phase"] = "asleep";
  let muted = false;
  let heard = "";
  let say = "";
  let pending: Pending | null = null;
  let nowPlaying: YoutubeHit | null = null;
  let micLevel = 0;
  let alert: string | null = null;
  let speech: SpeechCue | null = null;
  let speechSeq = 0;
  let armedUntil = 0;
  let settingsOpen = false;
  let theme: "jarvis" | "ultron" = "jarvis";
  let sensitivity = 0.5;
  let followSeconds = 9;
  let followUntil = 0;
  const transcript: EarLine[] = [];

  function pushLine(role: EarLine["role"], text: string) {
    const line = text.trim();
    if (!line) return;
    transcript.push({ role, text: line });
    if (transcript.length > 24) transcript.shift();
  }

  function status(): EarStatus {
    return {
      phase,
      wakeWord: deps.wakeWord || "hey jarvis",
      muted,
      heard,
      say,
      pending: pending ? { kind: pending.kind, summary: pending.summary } : null,
      nowPlaying,
      codingBackend: deps.coding?.id || "none",
      micLevel,
      alert,
      transcript: transcript.slice(),
      speech,
      armed: Date.now() < armedUntil,
      settingsOpen,
      theme,
      sensitivity,
      followSeconds,
      followUntil,
    };
  }

  function emit() {
    notifyEar(status());
  }

  function finish(turn: VoiceTurn, next: EarStatus["phase"] = "asleep"): VoiceTurn {
    say = turn.say;
    if (turn.say.trim()) {
      speechSeq += 1;
      speech = { id: String(speechSeq), text: turn.say.trim(), playback: "pending" };
      pushLine("jarvis", turn.say);
    }
    if (next === "confirming") phase = "confirming";
    else if (muted) phase = "muted";
    else if (next === "asleep" && turn.say.trim()) phase = "speaking";
    else phase = next;
    emit();
    return turn;
  }

  async function hear(text: string, opts?: { pushToTalk?: boolean }): Promise<VoiceTurn> {
    const spoken = text.trim();
    heard = spoken;
    if (muted && !opts?.pushToTalk) {
      const wake = routeVoiceIntent(spoken);
      if (wake.kind === "ear" && wake.action === "unmute") {
        muted = false;
        pending = null;
        return finish({ say: "Listening again.", acted: true });
      }
      return finish({ say: "", acted: false }, "muted");
    }

    if (pending) {
      if (isApproval(spoken)) return confirm();
      if (isRefusal(spoken) || /^stop$/i.test(spoken)) {
        pending = null;
        return finish({ say: "Cancelled.", acted: false });
      }
      pending = null;
    }

    pushLine("you", spoken);
    if (!muted) phase = "thinking";
    const plan = planFromTranscript(spoken);
    if (plan) return runPlan(plan);
    return runIntent(routeVoiceIntent(spoken));
  }

  async function confirm(): Promise<VoiceTurn> {
    const item = pending;
    pending = null;
    if (!item) return finish({ say: "Nothing is waiting.", acted: false });
    if (item.kind === "destructive") {
      if (!item.tool) {
        return finish({
          say: `Tell me exactly what to ${item.summary}. I have not changed anything.`,
          acted: false,
        });
      }
      const done = await tool(item.tool, item.args || {}, `Done. ${item.summary}.`);
      if (!item.after.length) return done;
      const rest = await runPlan(item.after);
      return finish({ say: `${done.say} ${rest.say}`.trim(), acted: done.acted || rest.acted });
    }
    if (item.kind === "computer") return runComputer(item.intent, true);
    if (!deps.git) return finish({ say: "I can't touch git from here.", acted: false });
    try {
      const applied = await applyApprovedChange(deps.git, {
        branch: item.branch,
        diff: item.diff,
        message: item.message,
      });
      return finish({ say: applied.say, acted: applied.ok });
    } catch (err) {
      return finish({ say: `I did not commit. ${(err as Error).message}`, acted: false });
    }
  }

  async function runIntent(intent: VoiceIntent): Promise<VoiceTurn> {
    if (intent.kind === "destructive") {
      pending = { kind: "destructive", summary: intent.summary, tool: intent.tool, args: intent.args, after: [] };
      return finish({ say: `Say yes to ${intent.summary}.`, acted: false }, "confirming");
    }
    if (intent.kind === "settings") return applySettings(intent);
    if (intent.kind === "ear") {
      muted = intent.action === "mute";
      if (muted) pending = null;
      return finish(
        { say: muted ? "Muted. Say Hey Jarvis, unmute, when you want me back." : "Listening again.", acted: true },
        muted ? "muted" : "asleep"
      );
    }
    if (intent.kind === "play") return play(intent.query);
    if (intent.kind === "website") return openSite(intent.url);
    if (intent.kind === "app") return app(intent.action, intent.name);
    if (intent.kind === "media") return tool(mediaTool(intent.action), {}, "Done.");
    if (intent.kind === "volume") return volume(intent);
    if (intent.kind === "system") {
      return intent.action === "lock"
        ? tool("lock_screen", {}, "Locking the screen.")
        : tool("take_screenshot", {}, "Screenshot saved.");
    }
    if (intent.kind === "computer") return runComputer(intent, false);
    if (intent.kind === "coding") return code(intent.task);
    return general(intent.text);
  }

  async function play(query: string): Promise<VoiceTurn> {
    let resolved: YoutubeResult;
    try {
      resolved = await deps.resolveYouTube(query);
    } catch (err) {
      return finish({ say: `YouTube search failed. ${(err as Error).message}`, acted: false });
    }
    if (!resolved.ok) {
      return finish({ say: resolved.error, acted: false, needsKey: resolved.needsKey || undefined });
    }
    nowPlaying = resolved.hit;
    try {
      const opened = await deps.openUrl(resolved.hit.url);
      if (!opened.ok) {
        return finish({
          say: `Found ${resolved.hit.title}. The browser did not open. ${opened.error || ""}`.trim(),
          acted: false,
        });
      }
    } catch (err) {
      return finish({ say: `Found ${resolved.hit.title}, but the browser failed. ${(err as Error).message}`, acted: false });
    }
    return finish({ say: `Playing ${resolved.hit.title}.`, acted: true });
  }

  async function openSite(url: string): Promise<VoiceTurn> {
    const opened = await deps.openUrl(url);
    return finish({
      say: opened.ok ? `Opening ${url}.` : (opened.error || "I couldn't open that site."),
      acted: opened.ok,
    });
  }

  async function app(action: "open" | "close" | "focus", name: string): Promise<VoiceTurn> {
    if (!allowed.has(name)) {
      return finish({ say: `${name} is not allowed. Add it to voice-ear.config.json if it should be.`, acted: false });
    }
    const toolName = action === "close" ? "close_app" : action === "focus" ? "focus_app" : "open_app";
    const verb = action === "close" ? "Closed" : action === "focus" ? "Focused" : "Opened";
    return tool(toolName, { name }, `${verb} ${name}.`);
  }

  async function volume(intent: Extract<VoiceIntent, { kind: "volume" }>): Promise<VoiceTurn> {
    if (intent.direction === "set") {
      const level = Math.max(0, Math.min(100, Math.round(intent.level ?? 0)));
      return tool("set_volume", { percent: level }, `Volume set to ${level}.`);
    }
    return tool("music_volume", { direction: intent.direction, steps: 5 }, `Volume ${intent.direction}.`);
  }

  async function runComputer(intent: Extract<VoiceIntent, { kind: "computer" }>, approved: boolean): Promise<VoiceTurn> {
    if (!approved) {
      const summary = intent.action === "click"
        ? `click ${intent.x}, ${intent.y}`
        : intent.action === "key"
          ? `press ${intent.key}`
          : `type ${intent.text}`;
      pending = { kind: "computer", summary, intent };
      return finish({ say: `Say yes and I will ${summary}.`, acted: false }, "confirming");
    }
    if (intent.action === "type") return tool("type_text", { text: intent.text }, "Typed that.");
    if (intent.action === "key") return tool("key_press", { key: intent.key }, `Pressed ${intent.key}.`);
    if (!deps.computerUse || !deps.click) {
      return finish({
        say: "Clicking stays off. Set VOICE_COMPUTER_USE=1 on Windows if you want me to click.",
        acted: false,
      });
    }
    const result = await deps.click(intent.x, intent.y);
    return finish({ say: result.ok ? `Clicked ${intent.x}, ${intent.y}.` : result.message, acted: result.ok });
  }

  async function code(task: string): Promise<VoiceTurn> {
    if (!deps.coding) {
      return finish({ say: "needs key — no coding backend is configured.", acted: false, needsKey: true });
    }
    const ready = await deps.coding.status();
    if (!ready.ready) {
      return finish({ say: ready.detail, acted: false, needsKey: ready.needsKey || undefined });
    }
    const proposal = await deps.coding.propose(task);
    if (!proposal.ok) {
      return finish({ say: proposal.detail, acted: false, needsKey: proposal.needsKey || undefined });
    }
    const branch = voiceBranchName(task, deps.stamp ? deps.stamp() : Date.now().toString(36));
    pending = {
      kind: "coding",
      summary: proposal.summary,
      diff: proposal.diff,
      branch,
      message: `Voice: ${proposal.summary}`,
    };
    return finish({
      say: `${proposal.summary} Say yes to apply this on branch ${branch}. I will not push.`,
      acted: false,
    }, "confirming");
  }

  async function general(text: string): Promise<VoiceTurn> {
    if (!deps.brain) {
      return finish({
        say: "I can play YouTube, open apps, and run small system actions.",
        acted: false,
      });
    }
    try {
      const raw = await deps.brain(text);
      const steps = stepsFromBrain(raw);
      if (steps && steps.length > 1) return runPlan(steps);
      const decided = decisionFromBrain(raw);
      if (!decided) return finish({ say: "I didn't catch a command.", acted: false });
      if (decided.kind === "general") {
        return finish({ say: decided.text || "Alright.", acted: false });
      }
      return runIntent(decided);
    } catch {
      return finish({ say: "The brain didn't answer. I left everything as it was.", acted: false });
    }
  }

  async function tool(name: string, args: Record<string, unknown>, okSay: string): Promise<VoiceTurn> {
    try {
      const result = await deps.runTool(name, args);
      return finish({ say: result.ok ? okSay : result.message, acted: result.ok });
    } catch (err) {
      return finish({ say: (err as Error).message || "That failed.", acted: false });
    }
  }

  async function runPlan(steps: VoiceIntent[]): Promise<VoiceTurn> {
    const said: string[] = [];
    for (let index = 0; index < steps.length; index++) {
      const intent = steps[index];
      if (intent.kind === "destructive") {
        pending = {
          kind: "destructive",
          summary: intent.summary,
          tool: intent.tool,
          args: intent.args,
          after: steps.slice(index + 1),
        };
        return finish({ say: `${spokenSummary(said)} Say yes to ${intent.summary}.`.trim(), acted: said.length > 0 }, "confirming");
      }
      const turn = await runIntent(intent);
      if (phase === "confirming") return turn;
      if (turn.say) said.push(turn.say);
    }
    return finish({ say: spokenSummary(said), acted: true });
  }

  function applySettings(intent: Extract<VoiceIntent, { kind: "settings" }>): VoiceTurn {
    if (intent.action === "open") {
      settingsOpen = true;
      return finish({ say: "Settings are open. Ctrl Alt J hides them.", acted: true });
    }
    if (intent.action === "close") {
      settingsOpen = false;
      return finish({ say: "Settings closed.", acted: true });
    }
    if (intent.action === "theme" && intent.theme) {
      theme = intent.theme;
      return finish({ say: intent.theme === "ultron" ? "Ultron palette." : "Jarvis palette.", acted: true });
    }
    if (intent.action === "sensitivity" && typeof intent.value === "number") {
      sensitivity = Math.min(1, Math.max(0.1, intent.value));
      return finish({ say: `Sensitivity ${sensitivity.toFixed(2)}.`, acted: true });
    }
    if (intent.action === "follow" && typeof intent.value === "number") {
      followSeconds = Math.min(60, Math.max(4, Math.round(intent.value)));
      return finish({ say: `Follow-up window is ${followSeconds} seconds.`, acted: true });
    }
    return finish({ say: "I didn't catch that setting.", acted: false });
  }

  return {
    hear,
    status,
    setMuted(next: boolean) {
      muted = next;
      phase = next ? "muted" : "asleep";
      if (next) pending = null;
      emit();
    },
    setPresence(next: "asleep" | "listening" | "thinking" | "speaking" | "alert") {
      if (muted) return;
      if (pending && next !== "alert") return;
      phase = next;
      if (next === "alert") alert = alert || "Attention.";
      if (next === "asleep") alert = null;
      emit();
    },
    setMicLevel(level: number) {
      micLevel = Math.min(1, Math.max(0, level));
      emit();
    },
    arm(ms = 8000) {
      armedUntil = Date.now() + ms;
      if (!muted) phase = "listening";
      emit();
    },
    consumeArm() {
      const armed = Date.now() < armedUntil;
      armedUntil = 0;
      return armed;
    },
    notePlayback(id: string, playback: SpeechCue["playback"]) {
      if (!speech || speech.id !== id) return status();
      speech = { ...speech, playback };
      if (playback === "done" || playback === "local") {
        if (!pending && !muted && phase === "speaking") {
          phase = "listening";
          followUntil = Date.now() + followSeconds * 1000;
        }
      }
      emit();
      return status();
    },
  };
}

function mediaTool(action: "pause" | "stop" | "next" | "previous" | "mute"): string {
  if (action === "pause") return "music_pause";
  if (action === "stop") return "music_stop";
  if (action === "next") return "music_next";
  if (action === "previous") return "music_previous";
  return "music_mute";
}
