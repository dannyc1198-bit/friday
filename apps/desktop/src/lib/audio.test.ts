import test from "node:test";
import assert from "node:assert/strict";
import { fillBands, rmsFromTimeDomain, smoothToward, speechEnergy } from "./audio.js";

test("silence stays shut and a loud frame opens", () => {
  assert.equal(speechEnergy(rmsFromTimeDomain(new Uint8Array(8).fill(128))), 0);
  const loud = new Uint8Array(8);
  for (let i = 0; i < loud.length; i++) loud[i] = i % 2 ? 20 : 230;
  assert.ok(speechEnergy(rmsFromTimeDomain(loud)) > 0.4);
});

test("equalizer bins stay in range and follow the spectrum", () => {
  const freq = new Uint8Array(48).fill(10);
  freq[0] = 255;
  const bins = new Float32Array(8);
  fillBands(freq, bins);
  assert.ok(bins[0] > bins[7]);
  for (const value of bins) assert.ok(value >= 0 && value <= 1);
});

test("smoothing does not overshoot", () => {
  assert.equal(smoothToward(0, 1, 0.25), 0.25);
});
