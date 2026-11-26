import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceEar, type VoiceEarDeps } from "./session.js";
import type { YoutubeHit } from "./youtube.js";

const HIT: YoutubeHit = {
  title: "Bohemian Rhapsody",
  videoId: "fJ9rUzIMcZQ",
  url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
  embedUrl: "https://www.youtube.com/embed/fJ9rUzIMcZQ?autoplay=1",
  source: "youtube-api",
};

function harness(over: Partial<VoiceEarDeps> = {}) {
  const tools: Array<{ name: string; args: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const gitCalls: string[] = [];
  let proposal = "Add a health route.";
  const ear = createVoiceEar({
    allowedApps: ["chrome", "spotify", "discord", "steam", "notepad", "vscode"],
    stamp: () => "1",
    resolveYouTube: async () => ({ ok: true, hit: HIT }),
    openUrl: async (url) => {
      opened.push(url);
      return { ok: true };
    },
    runTool: async (name, args) => {
      tools.push({ name, args });
      return { ok: true, message: "done" };
    },
    coding: {
      id: "codex",
      status: async () => ({ ready: true, needsKey: false, detail: "codex" }),
      propose: async () => ({ ok: true, summary: proposal, diff: "diff --git a/a.ts b/a.ts\n", detail: "" }),
    },
    git: {
      currentBranch: async () => "simple-friday",
      checkoutNew: async (branch) => { gitCalls.push(`checkout ${branch}`); },
      applyDiff: async () => { gitCalls.push("apply"); },
      commit: async () => { gitCalls.push("commit"); },
    },
    ...over,
  });
  return { ear, tools, opened, gitCalls, setProposal: (value: string) => { proposal = value; } };
}

test("play opens the top youtube link and remembers it for the dashboard", async () => {
  const { ear, opened } = harness();
  const turn = await ear.hear("play me Bohemian Rhapsody");
  assert.equal(opened[0], HIT.url);
  assert.match(turn.say, /Bohemian Rhapsody/);
  assert.equal(ear.status().nowPlaying?.url, HIT.url);
  assert.equal(turn.needsKey, undefined);
});

test("a missing youtube key is spoken and does not throw", async () => {
  const { ear, opened } = harness({
    resolveYouTube: async () => ({ ok: false, needsKey: true, error: "needs key — set YOUTUBE_API_KEY, or install yt-dlp" }),
  });
  const turn = await ear.hear("play lofi");
  assert.equal(opened.length, 0);
  assert.equal(turn.needsKey, true);
  assert.match(turn.say, /needs key/i);
});

test("open and close stay on the allowlist", async () => {
  const { ear, tools } = harness();
  await ear.hear("open Chrome");
  await ear.hear("open Steam");
  const blocked = await ear.hear("open malware");
  assert.deepEqual(tools.map((call) => call.args.name), ["chrome", "steam"]);
  assert.match(blocked.say, /not allowed/i);
});

test("pause, next, screenshot, and lock call the existing tools", async () => {
  const { ear, tools } = harness();
  await ear.hear("pause");
  await ear.hear("next song");
  await ear.hear("take a screenshot");
  await ear.hear("lock the computer");
  assert.deepEqual(tools.map((call) => call.name), ["music_pause", "music_next", "take_screenshot", "lock_screen"]);
});

test("delete, send, and purchase are refused even after yes", async () => {
  const { ear, tools, gitCalls } = harness();
  const asked = await ear.hear("delete my downloads");
  assert.match(asked.say, /say yes/i);
  assert.equal(ear.status().phase, "confirming");
  const refused = await ear.hear("yes");
  assert.match(refused.say, /won't/i);
  assert.equal(tools.length, 0);
  assert.equal(gitCalls.length, 0);
  const send = await ear.hear("send a message to Sam");
  await ear.hear("yes");
  assert.match(send.say, /say yes/i);
  assert.equal(tools.length, 0);
});

test("typing waits for yes, clicking stays off unless computer use is armed", async () => {
  const { ear, tools } = harness();
  const asked = await ear.hear("type hello world");
  assert.match(asked.say, /say yes/i);
  assert.equal(tools.length, 0);
  await ear.hear("yes");
  assert.deepEqual(tools[0], { name: "type_text", args: { text: "hello world" } });

  const click = await ear.hear("click at 10 20");
  await ear.hear("yes");
  assert.match(click.say, /say yes/i);
  assert.equal(tools.some((call) => call.name === "mouse_click"), false);
});

test("armed computer use clicks only after yes", async () => {
  const clicks: Array<[number, number]> = [];
  const { ear } = harness({
    computerUse: true,
    click: async (x, y) => {
      clicks.push([x, y]);
      return { ok: true, message: "clicked" };
    },
  });
  await ear.hear("click at 10 20");
  assert.equal(clicks.length, 0);
  const turn = await ear.hear("yes");
  assert.deepEqual(clicks, [[10, 20]]);
  assert.match(turn.say, /click/i);
});

test("coding reads the plan and commits only after a spoken yes, on a voice branch", async () => {
  const { ear, gitCalls } = harness();
  const plan = await ear.hear("add a health check endpoint to the orchestrator");
  assert.match(plan.say, /health route/i);
  assert.match(plan.say, /voice\/add-a-health-check-endpoint-to-the-orchestrator-1/);
  assert.match(plan.say, /not push/i);
  assert.equal(gitCalls.length, 0);
  const no = await ear.hear("no");
  assert.match(no.say, /cancelled/i);
  assert.equal(gitCalls.length, 0);

  await ear.hear("add a health check endpoint to the orchestrator");
  const yes = await ear.hear("yes");
  assert.equal(yes.acted, true);
  assert.deepEqual(gitCalls, [
    "checkout voice/add-a-health-check-endpoint-to-the-orchestrator-1",
    "apply",
    "commit",
  ]);
});

test("stop cancels a pending plan and otherwise stops playback", async () => {
  const { ear, tools, gitCalls } = harness();
  await ear.hear("write a function that sorts tasks");
  await ear.hear("stop");
  assert.equal(gitCalls.length, 0);
  await ear.hear("stop");
  assert.deepEqual(tools.map((call) => call.name), ["music_stop"]);
});

test("mute ignores commands until unmute or push to talk", async () => {
  const { ear, tools } = harness();
  await ear.hear("mute");
  assert.equal(ear.status().muted, true);
  assert.equal(ear.status().phase, "muted");
  const ignored = await ear.hear("open chrome");
  assert.equal(ignored.acted, false);
  assert.equal(tools.length, 0);
  await ear.hear("open chrome", { pushToTalk: true });
  assert.equal(tools.length, 1);
  await ear.hear("unmute");
  assert.equal(ear.status().muted, false);
});

test("the brain can open an app and cannot send mail", async () => {
  const { ear, tools } = harness({
    brain: async (text) => {
      if (text.includes("mail")) return JSON.stringify({ tool: "gmail_send", args: { to: "a@b.c" }, say: "Sending." });
      return JSON.stringify({ tool: "open_app", args: { name: "spotify" }, say: "Opening Spotify." });
    },
  });
  const open = await ear.hear("put spotify on");
  assert.equal(tools[0]?.name, "open_app");
  assert.match(open.say, /Spotify|done|Opened/i);
  const mail = await ear.hear("email the invoice");
  assert.match(mail.say, /say yes|won't/i);
  const after = await ear.hear("yes");
  assert.match(after.say, /won't/i);
  assert.equal(tools.length, 1);
});

test("a spoken answer from the brain is not asked again", async () => {
  let calls = 0;
  const { ear } = harness({
    brain: async () => {
      calls += 1;
      return JSON.stringify({ tool: null, say: "It is three." });
    },
  });
  const turn = await ear.hear("what time is it");
  assert.equal(calls, 1);
  assert.match(turn.say, /three/);
});

test("a missing coding backend says needs key", async () => {
  const { ear, gitCalls } = harness({
    coding: {
      id: "xai-grok",
      status: async () => ({ ready: false, needsKey: true, detail: "needs key — set XAI_API_KEY" }),
      propose: async () => ({ ok: false, summary: "", diff: "", detail: "should not run" }),
    },
  });
  const turn = await ear.hear("fix the login bug");
  assert.equal(turn.needsKey, true);
  assert.match(turn.say, /needs key/i);
  assert.equal(gitCalls.length, 0);
});
