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
import { appsQuestion, describeApps } from "./live-apps.js";

test("app questions are answered from the probe, not the model", () => {
  assert.deepEqual(appsQuestion("Is God's Eye up?"), { ids: ["gods-eye"], open: false });
  assert.equal(appsQuestion("open anatomy")?.open, true);
  assert.equal(appsQuestion("write a post about sports nutrition and why it matters to athletes"), null);
  assert.equal(
    describeApps([{ id: "gods-eye", name: "God's Eye", url: "", page: "/apps/gods-eye", up: false, headline: null, source: "", checkedAt: "" }], false),
    "God's Eye is down (not answering)."
  );
});
