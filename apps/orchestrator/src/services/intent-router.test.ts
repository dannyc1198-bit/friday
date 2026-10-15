import test from "node:test";
import assert from "node:assert/strict";
import {
  applyToolCallDelta,
  argumentsForTool,
  canonicalToolArguments,
  classifyIntent,
  isOutboundTool,
  isUnapprovedExternalAction,
  parseToolArguments,
  resolveToolCall,
  type PartialToolCall,
} from "./intent-router.js";

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

test("Gemini brain_recall stream does not replay invalid JSON", () => {
  const question = "Who is Russell Ally and what is my Enagic goal?";
  const intent = classifyIntent(question);
  const partials: Record<number, PartialToolCall> = {};
  // Gemini 2.5 Flash OpenAI-compat stream: empty object, then the real object.
  // The index is missing on the later chunks. Concatenating them used to log
  // "brain_recall: Tool arguments were not valid JSON" and the next request 400'd.
  applyToolCallDelta(partials, { id: "call_russell", function: { name: "brain_recall", arguments: "" } });
  applyToolCallDelta(partials, { function: { arguments: "{}" } });
  applyToolCallDelta(partials, { function: { arguments: JSON.stringify({ query: question }) } });
  applyToolCallDelta(partials, {
    extra_content: { google: { thought_signature: "sig-russell" } },
  });

  const call = partials[0];
  assert.equal(call.name, "brain_recall");
  assert.equal(call.extra && (call.extra as { google: { thought_signature: string } }).google.thought_signature, "sig-russell");

  const naive = "{}" + JSON.stringify({ query: question });
  const parsed = parseToolArguments(naive);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.query, question);

  const assembled = parseToolArguments(call.argumentsJson);
  assert.equal(assembled.ok, true);
  if (assembled.ok) assert.equal(assembled.value.query, question);

  const history = canonicalToolArguments(naive);
  assert.deepEqual(JSON.parse(history), { query: question });

  const recovered = argumentsForTool("{{{not-json", "brain_recall", intent);
  assert.equal(recovered.ok, true);
  if (recovered.ok) {
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.value.query, question);
  }
  assert.doesNotThrow(() => JSON.parse(canonicalToolArguments("{{{not-json")));

  const objectDelta: Record<number, PartialToolCall> = {};
  applyToolCallDelta(objectDelta, { index: 0, id: "call_obj", function: { name: "brain_recall", arguments: {} } });
  applyToolCallDelta(objectDelta, { index: 0, function: { arguments: { query: question } } });
  assert.equal(JSON.parse(canonicalToolArguments(objectDelta[0].argumentsJson)).query, question);
  assert.doesNotMatch(objectDelta[0].argumentsJson, /\[object Object\]/);
});

test("outbound tools and tasks stay drafts", () => {
  assert.equal(isOutboundTool("gmail_send"), true);
  assert.equal(isOutboundTool("brain_recall"), false);
  assert.equal(isUnapprovedExternalAction("send the invoice email to Russell"), true);
  assert.equal(isUnapprovedExternalAction("Who is Russell Ally and what is my Enagic goal?"), false);
  const blocked = resolveToolCall("gmail_send", known, classifyIntent("hello there"));
  assert.equal(blocked.name, null);
  assert.match(blocked.reason, /drafts/i);
});
