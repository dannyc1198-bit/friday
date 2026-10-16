import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTabCommand, stepTab, tabIndex } from "./app-tabs";

test("voice tab commands", () => {
  assert.equal(parseTabCommand("Next tab.", "/"), "/agents");
  assert.equal(parseTabCommand("previous tab", "/"), "/apps/sports");
  assert.equal(parseTabCommand("Show God's Eye", "/agents"), "/apps/gods-eye");
  assert.equal(parseTabCommand("open anatomy", "/"), "/apps/anatomy");
  assert.equal(parseTabCommand("Friday, go to sports", "/"), "/apps/sports");
  assert.equal(parseTabCommand("what is the anatomy of a contract", "/"), null);
});

test("tab stepping wraps", () => {
  assert.equal(stepTab("/apps/sports", 1), "/");
  assert.equal(tabIndex("/apps/anatomy"), 4);
  assert.equal(parseTabCommand("show the brain", "/"), "/brain-core");
  assert.equal(tabIndex("/tasks"), -1);
});