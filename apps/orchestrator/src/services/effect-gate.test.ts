import test from "node:test";
import assert from "node:assert/strict";
import {
  assessBrowserEffect,
  bindingKey,
  consumeGrantedEffect,
  grantEffect,
  resetEffectGate,
  stageEffect,
  takeStagedEffect,
} from "./effect-gate.js";

const ctx = { url: "https://shop.example/checkout", stagedText: "Send the note. Total $42.00" };

test("enter and submit clicks need an exact binding; ordinary clicks do not", () => {
  resetEffectGate();
  const click = assessBrowserEffect("browser_click", { selector: "text=Send" }, ctx);
  assert.ok(click);
  assert.equal(click?.action, "click-submit");
  assert.equal(click?.destination, ctx.url);
  assert.equal(click?.content, ctx.stagedText);
  assert.equal(click?.amount, "$42.00");
  assert.equal(assessBrowserEffect("browser_click", { selector: "a.article" }, ctx), null);
  const enter = assessBrowserEffect("browser_press_key", { key: "Enter" }, ctx);
  assert.equal(enter?.action, "key-submit");
  assert.equal(assessBrowserEffect("browser_type", { text: "hello" }, ctx), null);
  assert.equal(assessBrowserEffect("browser_type", { text: "hello\n" }, ctx)?.action, "submit-by-newline");
});

test("a grant allows one identical binding and no other", () => {
  resetEffectGate();
  const binding = assessBrowserEffect("browser_press_key", { key: "Enter" }, ctx)!;
  const token = stageEffect("browser_press_key", { key: "Enter" }, binding, 10);
  const staged = takeStagedEffect(token, 10);
  assert.equal(bindingKey(staged!.binding), bindingKey(binding));
  assert.equal(consumeGrantedEffect(binding, 10), false);
  grantEffect(binding, 10);
  assert.equal(consumeGrantedEffect({ ...binding, amount: "$1.00" }, 10), false);
  grantEffect(binding, 10);
  assert.equal(consumeGrantedEffect(binding, 10), true);
  assert.equal(consumeGrantedEffect(binding, 10), false);
});
