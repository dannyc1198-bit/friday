import test from "node:test";
import assert from "node:assert/strict";
import { decisionFromBrain, isApproval, isRefusal, routeVoiceIntent } from "./intent.js";

test("play me a song strips the wake word and keeps the title", () => {
  const intent = routeVoiceIntent("Hey Jarvis, play me Bohemian Rhapsody");
  assert.deepEqual(intent, { kind: "play", query: "Bohemian Rhapsody" });
});

test("play on youtube drops the source words", () => {
  const intent = routeVoiceIntent("play lofi hip hop on youtube");
  assert.equal(intent.kind, "play");
  if (intent.kind === "play") assert.equal(intent.query, "lofi hip hop");
});

test("open, close, and focus use the allowlisted app name", () => {
  for (const name of ["chrome", "Spotify", "Discord", "Steam"]) {
    const intent = routeVoiceIntent(`open ${name}`);
    assert.equal(intent.kind, "app");
    if (intent.kind === "app") {
      assert.equal(intent.action, "open");
      assert.equal(intent.name, name.toLowerCase());
    }
  }
  const close = routeVoiceIntent("close discord");
  assert.deepEqual(close, { kind: "app", action: "close", name: "discord" });
  const focus = routeVoiceIntent("switch to chrome");
  assert.deepEqual(focus, { kind: "app", action: "focus", name: "chrome" });
});

test("websites stay links and apps stay apps", () => {
  const site = routeVoiceIntent("open https://github.com");
  assert.deepEqual(site, { kind: "website", url: "https://github.com" });
  const domain = routeVoiceIntent("go to youtube.com");
  assert.deepEqual(domain, { kind: "website", url: "https://youtube.com" });
});

test("media and volume commands map to playback controls", () => {
  assert.deepEqual(routeVoiceIntent("pause"), { kind: "media", action: "pause" });
  assert.deepEqual(routeVoiceIntent("stop the video"), { kind: "media", action: "stop" });
  assert.deepEqual(routeVoiceIntent("next song"), { kind: "media", action: "next" });
  assert.deepEqual(routeVoiceIntent("previous"), { kind: "media", action: "previous" });
  assert.deepEqual(routeVoiceIntent("volume up"), { kind: "volume", direction: "up" });
  assert.deepEqual(routeVoiceIntent("turn it down"), { kind: "volume", direction: "down" });
  assert.deepEqual(routeVoiceIntent("set volume to 40"), { kind: "volume", direction: "set", level: 40 });
  assert.deepEqual(routeVoiceIntent("mute the music"), { kind: "media", action: "mute" });
});

test("screenshot and lock are basic system actions", () => {
  assert.deepEqual(routeVoiceIntent("take a screenshot"), { kind: "system", action: "screenshot" });
  assert.deepEqual(routeVoiceIntent("lock the computer"), { kind: "system", action: "lock" });
});

test("bare mute sleeps the ear and unmute wakes it", () => {
  assert.deepEqual(routeVoiceIntent("mute"), { kind: "ear", action: "mute" });
  assert.deepEqual(routeVoiceIntent("stop listening"), { kind: "ear", action: "mute" });
  assert.deepEqual(routeVoiceIntent("unmute"), { kind: "ear", action: "unmute" });
});

test("destructive speech is never a normal tool", () => {
  for (const line of [
    "delete my downloads",
    "shut down the computer",
    "send a message to Sam",
    "buy this on amazon",
  ]) {
    const intent = routeVoiceIntent(line);
    assert.equal(intent.kind, "destructive", line);
  }
});

test("coding requests stay out of the app opener", () => {
  const intent = routeVoiceIntent("add a health check endpoint to the orchestrator");
  assert.equal(intent.kind, "coding");
  if (intent.kind === "coding") assert.match(intent.task, /health check endpoint/);
  assert.equal(routeVoiceIntent("write a function that sorts tasks").kind, "coding");
  assert.equal(routeVoiceIntent("open vscode").kind, "app");
});

test("computer use is one typed, keyed, or clicked step", () => {
  assert.deepEqual(routeVoiceIntent("type hello world"), { kind: "computer", action: "type", text: "hello world" });
  assert.deepEqual(routeVoiceIntent("press enter"), { kind: "computer", action: "key", key: "enter" });
  assert.deepEqual(routeVoiceIntent("click at 200 400"), { kind: "computer", action: "click", x: 200, y: 400 });
});

test("anything else is left for the brain", () => {
  assert.deepEqual(routeVoiceIntent("what time is it"), { kind: "general", text: "what time is it" });
});

test("yes and no are approvals, stop is not", () => {
  assert.equal(isApproval("Yes"), true);
  assert.equal(isApproval("go ahead"), true);
  assert.equal(isApproval("play a song"), false);
  assert.equal(isRefusal("no"), true);
  assert.equal(isRefusal("never mind"), true);
  assert.equal(isRefusal("stop"), false);
});

test("brain JSON can name an allowed tool and cannot name a send", () => {
  const open = decisionFromBrain('{"tool":"open_app","args":{"name":"chrome"},"say":"Opening Chrome."}');
  assert.deepEqual(open, { kind: "app", action: "open", name: "chrome" });
  const chat = decisionFromBrain('{"tool":null,"say":"It is three o\'clock."}');
  assert.deepEqual(chat, { kind: "general", text: "It is three o'clock." });
  const blocked = decisionFromBrain('{"tool":"gmail_send","args":{"to":"a@b.c"},"say":"Sending."}');
  assert.equal(blocked?.kind, "destructive");
  assert.equal(decisionFromBrain("not json"), null);
});
