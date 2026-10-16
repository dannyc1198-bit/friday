import test from "node:test";
import assert from "node:assert/strict";
import { selectReflectionWindow, type ReflectionTurn } from "./reflection-window.js";

function turn(iso: string, content: string): ReflectionTurn {
  return { iso, role: "Danny", content, source: `chat.jsonl#${iso}` };
}

test("a full day keeps later turns for the next pass and does not clip each turn to 500", () => {
  const turns = [turn("2026-10-15T21:00:00", "a".repeat(80)), turn("2026-10-15T22:30:00", "b".repeat(80))];
  const first = selectReflectionWindow(turns, null, 120);
  assert.equal(first.complete, false);
  assert.equal(first.selected.length, 1);
  assert.match(first.text, /a{80}/);
  const second = selectReflectionWindow(turns, first.nextWatermark, 120);
  assert.equal(second.complete, true);
  assert.match(second.text, /b{80}/);
  assert.match(second.text, /source chat.jsonl/);
});
