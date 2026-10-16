import test from "node:test";
import assert from "node:assert/strict";
import { bucketActivity, nextEiReport } from "./console";

test("the next EI report is the coming Monday, including today", () => {
  assert.equal(nextEiReport(new Date(2026, 9, 16)), "Oct 19");
  assert.equal(nextEiReport(new Date(2026, 9, 19)), "Oct 19");
  assert.equal(nextEiReport(new Date(2026, 9, 20)), "Oct 26");
});

test("activity buckets count events into local hours", () => {
  const now = new Date(2026, 9, 16, 15, 30, 0);
  const earlier = new Date(2026, 9, 16, 14, 10, 0).toISOString();
  const same = new Date(2026, 9, 16, 15, 5, 0).toISOString();
  const points = bucketActivity([earlier, same, same], now);
  assert.equal(points.length, 12);
  assert.equal(points[points.length - 1].count, 2);
  assert.equal(points[points.length - 2].count, 1);
});
