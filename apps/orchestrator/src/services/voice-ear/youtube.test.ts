import test from "node:test";
import assert from "node:assert/strict";
import { resolveYouTube } from "./youtube.js";

test("youtube data api returns the top video when a key is set", async () => {
  let called = "";
  const result = await resolveYouTube("bohemian rhapsody", {
    apiKey: "test-key",
    fetchImpl: async (url) => {
      called = String(url);
      return new Response(JSON.stringify({
        items: [{ id: { videoId: "fJ9rUzIMcZQ" }, snippet: { title: "Bohemian Rhapsody" } }],
      }), { status: 200 });
    },
    run: async () => {
      throw new Error("yt-dlp should not run when the API hits");
    },
  });
  assert.match(called, /youtube\/v3\/search/);
  assert.match(called, /key=test-key/);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.hit.videoId, "fJ9rUzIMcZQ");
    assert.equal(result.hit.title, "Bohemian Rhapsody");
    assert.equal(result.hit.url, "https://www.youtube.com/watch?v=fJ9rUzIMcZQ");
    assert.equal(result.hit.embedUrl, "https://www.youtube.com/embed/fJ9rUzIMcZQ?autoplay=1");
    assert.equal(result.hit.source, "youtube-api");
  }
});

test("a failed API search falls back to yt-dlp", async () => {
  const result = await resolveYouTube("lofi", {
    apiKey: "test-key",
    fetchImpl: async () => new Response("nope", { status: 403 }),
    run: async (cmd, args) => {
      assert.equal(cmd, "yt-dlp");
      assert.equal(args.at(-1), "ytsearch1:lofi");
      return { code: 0, stdout: "dQw4w9WgXcQ\tLofi Girl\n", stderr: "" };
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.hit.source, "yt-dlp");
    assert.equal(result.hit.title, "Lofi Girl");
    assert.equal(result.hit.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  }
});

test("no key uses a keyless yt-dlp search", async () => {
  const result = await resolveYouTube("lofi hip hop", {
    run: async (_cmd, args) => {
      assert.equal(args.at(-1), "ytsearch1:lofi hip hop");
      return { code: 0, stdout: "abc_def-123\tNight Drive\n", stderr: "" };
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.hit.videoId, "abc_def-123");
});

test("missing key and missing yt-dlp says needs key and does not throw", async () => {
  const result = await resolveYouTube("lofi", {
    run: async () => ({ code: null, stdout: "", stderr: "", error: "spawn yt-dlp ENOENT" }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.needsKey, true);
    assert.match(result.error, /needs key/i);
  }
});

test("an empty request is a normal error", async () => {
  const result = await resolveYouTube("   ", {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.needsKey, false);
});
