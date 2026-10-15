import test from "node:test";
import assert from "node:assert/strict";
import { messageSegments, obsidianOpenHref } from "./message-segments.js";

test("markdown links and note chips survive, and script urls do not", () => {
  const segments = messageSegments(
    "See [the brief](https://example.com/brief) and [[notes/launch|Launch]]. javascript:alert(1) stays text."
  );
  assert.equal(segments[1].type, "link");
  assert.equal(segments[3].type, "note");
  if (segments[3].type === "note") assert.equal(segments[3].note, "notes/launch");
  const hostile = messageSegments("[x](javascript:alert(1))");
  assert.equal(hostile[0].type, "text");
  assert.match(obsidianOpenHref("notes/launch"), /^obsidian:\/\/open\?file=/);
});
