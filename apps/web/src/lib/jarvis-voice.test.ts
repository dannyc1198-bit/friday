import test from "node:test";
import assert from "node:assert/strict";
import { pickJarvisVoice, pickNamedVoice } from "./jarvis-voice";

test("browser fallback prefers a British male voice over a British female voice", () => {
  const picked = pickJarvisVoice([
    { name: "Microsoft Sonia Online", lang: "en-GB" },
    { name: "Microsoft Ryan Online", lang: "en-GB" },
    { name: "Microsoft Zira", lang: "en-US" },
  ]);
  assert.equal(picked?.name, "Microsoft Ryan Online");
});

test("a mindspace edge preset picks that named browser voice", () => {
  const picked = pickNamedVoice([
    { name: "Microsoft Ryan Online", lang: "en-GB" },
    { name: "Microsoft Sonia Online", lang: "en-GB" },
  ], "en-GB-SoniaNeural");
  assert.equal(picked?.name, "Microsoft Sonia Online");
});

test("falls back to any en-GB voice when no male hint is present", () => {
  const picked = pickJarvisVoice([
    { name: "Microsoft Zira", lang: "en-US" },
    { name: "English United Kingdom", lang: "en-GB" },
  ]);
  assert.equal(picked?.lang, "en-GB");
});
