import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, access } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { openMemoryPort } from "./port.js";
import { assertLocalVector, type LocalEmbedder } from "./local-embed.js";
import { redactIngest, redactSecrets } from "./redact.js";
import { exclusionReason } from "./sources/files-readonly.js";
import { collectSocial } from "./sources/social-readonly.js";
import { isQuietHours, parseProjects, suggestOneStep } from "./sources/tracker.js";
import { grantEffect, requireGrantedOutgoing, resetEffectGate } from "../effect-gate.js";
import { writeFile, mkdir } from "fs/promises";

function fakeEmbed(dim: number, model = "test-local"): LocalEmbedder {
  return async (texts) => ({
    model,
    dim,
    vectors: texts.map((text) => {
      const vector = new Array(dim).fill(0);
      let hash = 0;
      for (const char of text) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
      vector[hash % dim] = 1;
      vector[(hash >> 3) % dim] = 0.2;
      return vector;
    }),
  });
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "friday-memory-"));
  const vault = path.join(root, "vault");
  const files = path.join(root, "Documents");
  await mkdir(path.join(files, "notes"), { recursive: true });
  await mkdir(vault, { recursive: true });
  const port = openMemoryPort({
    dbPath: path.join(root, "memory.sqlite"),
    vault,
    fileRoots: [files],
    embedder: fakeEmbed(32),
  });
  return { root, vault, files, port };
}

test("remember writes only under Jarvis, recall finds it, forget keeps the note", async () => {
  const { vault, port } = await fixture();
  const saved = await port.remember({ text: "The studio desk faces the window.", title: "Desk" });
  assert.equal(saved.duplicate, false);
  assert.ok(saved.path.startsWith("Jarvis/"));
  const note = await readFile(path.join(vault, saved.path), "utf8");
  assert.match(note, /studio desk/);
  const again = await port.remember({ text: "The studio desk faces the window.", title: "Desk" });
  assert.equal(again.duplicate, true);

  const hits = await port.recall("studio desk", ["obsidian"], 5);
  assert.ok(hits.some((hit) => hit.text.includes("studio desk")));

  const forgotten = await port.forget(saved.id);
  assert.equal(forgotten.forgotten, 1);
  await access(path.join(vault, saved.path));
  const after = await port.recall("studio desk", ["obsidian"], 5);
  assert.equal(after.filter((hit) => hit.id === saved.id).length, 0);
  port.close();
});

test("replacing a Jarvis note keeps a timestamped backup", async () => {
  const { vault, port } = await fixture();
  await port.saveProjects([{ name: "Wavelength", status: "current", nextStep: "Send the quote", updated: "2026-11-01" }]);
  await port.saveProjects([{ name: "Wavelength", status: "current", nextStep: "Book the call", updated: "2026-11-20" }]);
  const { readdir } = await import("fs/promises");
  const names = await readdir(path.join(vault, "Jarvis"));
  assert.ok(names.some((name) => name.startsWith("Projects.md.bak-")));
  const note = await readFile(path.join(vault, "Jarvis", "Projects.md"), "utf8");
  assert.match(note, /Book the call/);
  assert.doesNotMatch(note, /Send the quote/);
  port.close();
});

test("local vectors stay on their own model and refuse OpenAI 1536", async () => {
  const { root, vault, port } = await fixture();
  await port.remember({ text: "Alpha signal lives in the blue notebook on the shelf.", title: "Alpha" });
  const hits = await port.recall("Alpha signal lives in the blue notebook", ["obsidian"], 3);
  assert.equal(hits[0]?.title, "Alpha");
  port.close();
  assert.throws(() => assertLocalVector("text-embedding-3-small", 1536), /1536/);
  const bad = openMemoryPort({
    dbPath: path.join(root, "memory.sqlite"),
    vault,
    fileRoots: [],
    embedder: fakeEmbed(1536, "text-embedding-3-small"),
  });
  await assert.rejects(() => bad.reindex(), /1536|OpenAI/);
  bad.close();
});

test("file index is read-only, allowlisted, and redacts secrets", async () => {
  const { files, port } = await fixture();
  await writeFile(path.join(files, "notes", "hello.txt"), "Hello from the notes folder.\nAPI_KEY=sk-supersecretvalue\n", "utf8");
  await writeFile(path.join(files, ".env"), "SECRET=nope\n", "utf8");
  await mkdir(path.join(files, "node_modules", "pkg"), { recursive: true });
  await writeFile(path.join(files, "node_modules", "pkg", "index.js"), "secret code", "utf8");
  const report = await port.indexAll();
  assert.ok(report.files >= 1);
  const hits = await port.recall("Hello from the notes", ["files"], 5);
  assert.ok(hits.some((hit) => hit.text.includes("Hello from the notes")));
  assert.ok(hits.every((hit) => !hit.text.includes("sk-supersecretvalue")));
  assert.equal(exclusionReason(path.join(files, ".env")), "secret file");
  assert.equal(exclusionReason(path.join(files, "node_modules", "pkg", "index.js")), "noise directory");
  assert.throws(() => port.listFolder(path.join(files, "..", "outside")), /outside/);
  const listed = port.listFolder(path.join(files, "notes"));
  assert.ok(listed.some((entry) => entry.name === "hello.txt"));
  port.close();
});

test("social reads stay read-only and errors do not contain the key", async () => {
  resetEffectGate();
  const key = "super-secret-youtube-key";
  const failed = await collectSocial({
    env: { YOUTUBE_API_KEY: key, YOUTUBE_CHANNEL_ID: "chan" },
    fetchImpl: async (url) => {
      throw new Error(`network down ${url}`);
    },
  });
  assert.equal(failed.errors.length, 1);
  assert.equal(failed.errors[0].includes(key), false);
  assert.match(failed.errors[0], /Social read failed/);
  const pulled = await collectSocial({
    env: { YOUTUBE_API_KEY: key, YOUTUBE_CHANNEL_ID: "chan" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { items: [{ id: { videoId: "abc" }, snippet: { title: "Shop tour", description: "A walk through the shop" } }] };
      },
      async text() { return ""; },
    }),
  });
  assert.equal(pulled.items[0]?.title, "Shop tour");
  assert.equal(pulled.errors.length, 0);
  resetEffectGate();
  assert.throws(() => requireGrantedOutgoing("post", "https://api.x.com/2/tweets", "hello"), /leaves the machine/);
  resetEffectGate();
  const binding = {
    tool: "memory-port",
    action: "post",
    destination: "social-api",
    content: "",
    amount: "unspecified",
  };
  grantEffect(binding);
  assert.doesNotThrow(() => requireGrantedOutgoing("post", "social-api", ""));
});

test("one next step, and quiet hours stay quiet", () => {
  const projects = parseProjects("# Projects\n\n## Current\n\n- **Wavelength**. Next: Send the quote. updated: 2026-11-01.\n\n## Upcoming\n\n- **Kelowna**. Next: Pack the van. updated: 2026-11-01.\n");
  const suggestion = suggestOneStep({ projects, now: new Date(2026, 10, 26, 10, 0) });
  assert.equal(suggestion, "Next step on Wavelength: Send the quote");
  assert.equal(suggestion?.includes("Kelowna"), false);
  assert.equal(isQuietHours(new Date(2026, 10, 26, 23, 10), "23:00-05:30"), true);
  assert.equal(isQuietHours(new Date(2026, 10, 26, 10, 0), "23:00-05:30"), false);
  const redacted = redactIngest("token line\nAPI_KEY=abcd1234\n");
  assert.equal(redacted.redacted, true);
  assert.equal(redacted.text.includes("abcd1234"), false);
  assert.equal(redactSecrets("failed abcd1234", ["abcd1234"]).includes("abcd1234"), false);
});
