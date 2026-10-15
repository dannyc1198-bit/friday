import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, parseToolArguments, resolveToolCall } from "./intent-router.js";

const known = ["brain_recall", "brain_remember", "brain_status", "meshy_text_to_3d", "higgsfield_image", "higgsfield_video", "blender_render"];

test("profile questions route to recall and never to an unknown tool", () => {
  const businesses = classifyIntent("What are my businesses and products?");
  assert.equal(businesses.kind, "profile");
  assert.equal(businesses.tool, "brain_recall");

  const person = classifyIntent("Who is Russell Ally and what is my Enagic goal?");
  assert.equal(person.kind, "profile");
  const missing = resolveToolCall("", known, person);
  assert.equal(missing.name, "brain_recall");
  assert.match(missing.reason, /omitted the tool name/i);

  const invented = resolveToolCall("memory_search", known, person);
  assert.equal(invented.name, "brain_recall");
  assert.doesNotMatch(invented.name || "", /unknown/);
});

test("creative phrases pick Meshy, Higgsfield, and Blender", () => {
  assert.equal(classifyIntent("Make a 3D model of a brass compass").tool, "meshy_text_to_3d");
  assert.equal(classifyIntent("Make an image of a cyan arc reactor").tool, "higgsfield_image");
  assert.equal(classifyIntent("Make a video of the same reactor").tool, "higgsfield_video");
  assert.equal(classifyIntent("Render it in Blender").tool, "blender_render");
});

test("sending, spending, and trading are refused with a real reason", () => {
  const blocked = resolveToolCall("send_email", known, classifyIntent("hello there"));
  assert.equal(blocked.name, null);
  assert.match(blocked.reason, /drafts/i);
});

test("broken tool JSON is repaired or explained", () => {
  const repaired = parseToolArguments('{"query":"Enagic",}');
  assert.equal(repaired.ok, true);
  if (repaired.ok) assert.deepEqual(repaired.value, { query: "Enagic" });
  assert.equal(parseToolArguments("{").ok, false);
});
