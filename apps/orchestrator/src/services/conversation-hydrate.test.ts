import test from "node:test";
import assert from "node:assert/strict";
import { ensureConversation, getMessages } from "./conversation.js";

test("a restarted conversation keeps the saved transcript under the same id", () => {
  const id = "conv-hydrate-test";
  const conversation = ensureConversation(id, [
    { role: "user", content: "Remember the launch", timestamp: "2026-10-15T15:00:00.000Z" },
    { role: "assistant", content: "The checklist is open.", timestamp: "2026-10-15T15:00:02.000Z" },
  ]);
  assert.equal(conversation.id, id);
  const again = ensureConversation(id, []);
  assert.equal(again.messages.length, 2);
  assert.equal(getMessages(id)[0].content, "Remember the launch");
});
