import test from "node:test";
import assert from "node:assert/strict";
import { parametersToJsonSchema } from "./tool-schema.js";

test("array tool parameters keep required argument names", () => {
  const schema = parametersToJsonSchema([
    { name: "text", type: "string", description: "What to type", required: true },
    { name: "priority", type: "string", description: "Rank", required: false, enum: ["low", "high"] },
  ]);
  const properties = schema.properties as Record<string, { type: string }>;
  assert.equal(properties.text.type, "string");
  assert.deepEqual(schema.required, ["text"]);
  const priority = properties.priority as unknown as { enum: string[] };
  assert.equal(priority.enum[0], "low");
});

test("a json schema object passes through", () => {
  const original = { type: "object", properties: { query: { type: "string" } }, required: ["query"] };
  assert.equal(parametersToJsonSchema(original), original);
});
