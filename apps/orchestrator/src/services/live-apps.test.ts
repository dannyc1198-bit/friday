import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineFor } from "./live-apps.js";

test("headlines come only from data the app returned", () => {
  assert.equal(headlineFor("sports", { games: [{ state: "live" }, { state: "final" }] }), "1 live of 2 games");
  assert.equal(headlineFor("osiris", { stats: { flights: 8300 } }), "8,300 flights tracked");
  assert.equal(headlineFor("gods-eye", { ac: [1, 2, 3] }), "3 military aircraft live");
  assert.equal(headlineFor("sports", {}), null);
  assert.equal(headlineFor("anatomy", null), null);
});