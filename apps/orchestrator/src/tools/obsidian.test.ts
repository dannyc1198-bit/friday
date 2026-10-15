import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test-fixtures",
  "vault"
);
const root = mkdtempSync(path.join(os.tmpdir(), "friday-vault-"));
cpSync(fixture, root, { recursive: true });
process.env.OBSIDIAN_VAULT_PATH = root;

const { toolRegistry } = await import("./registry.js");
const { registerObsidianTools } = await import("./obsidian.js");
const brain = await import("../services/brain.js");
const { loadCoreProfile } = await import("../services/profile.js");

registerObsidianTools();

test.after(async () => {
  brain.stopBrain();
  rmSync(root, { recursive: true, force: true });
});

test("fixture vault can be searched, read, and written", async () => {
  const found = await toolRegistry.execute("obsidian_search", { query: "amber relay" });
  assert.equal(found.success, true);
  const matches = (found.data as { results: Array<{ path: string }> }).results;
  assert.ok(matches.some((hit) => hit.path === "Agents/JARVIS/standing-orders.md"));

  const note = await toolRegistry.execute("obsidian_read", { note: "Agents/JARVIS/standing-orders" });
  assert.equal(note.success, true);
  assert.match(String((note.data as { content: string }).content), /amber relay confirmed/);

  const created = await toolRegistry.execute("obsidian_create", {
    title: "Relay log",
    folder: "Agents/JARVIS",
    content: "# Relay log\n\nWrote this back from the orchestrator fixture test.\n",
  });
  assert.equal(created.success, true);

  const written = path.join(root, "Agents", "JARVIS", "Relay log.md");
  assert.match(readFileSync(written, "utf8"), /Wrote this back/);

  const outside = await toolRegistry.execute("obsidian_read", { note: "../../etc/passwd" });
  assert.equal(outside.success, false);
});

test("brain indexes the fixture vault and writes an entity note", async () => {
  const stats = await brain.initBrain();
  assert.ok(stats.notes >= 3);
  assert.equal(stats.vaultPath, root);

  const hits = brain.searchBrain("amber relay confirmed");
  assert.ok(hits.some((hit) => hit.notePath === "Agents/JARVIS/standing-orders.md"));

  const remembered = await brain.rememberFact({
    entity: "Fixture Relay",
    observation: "The fixture vault accepts write-back.",
    type: "fact",
    source: "manual",
  });
  assert.equal(remembered.created, true);
  const entity = readFileSync(path.join(root, "FRIDAY_BRAIN", "entities", "Fixture Relay.md"), "utf8");
  assert.match(entity, /fixture vault accepts write-back/);

  const profile = loadCoreProfile();
  assert.equal(profile.found, true);
  assert.match(profile.text, /Wavelength Solutions/);
  assert.match(profile.text, /Ally Wellness Group/);
  assert.match(profile.text, /Drafts only/);

  const businesses = brain.searchBrain("What are my businesses and products?");
  assert.ok(businesses.length > 0);
  assert.equal(businesses.some((hit) => hit.notePath.includes("archive/")), false);
  assert.ok(businesses.some((hit) => hit.notePath === "FRIDAY_BRAIN/entities/wavelength.md"));

  const enagic = brain.searchBrain("Who is Russell Ally and what is my Enagic goal?");
  assert.equal(enagic[0]?.notePath, "FRIDAY_BRAIN/entities/enagic.md");
});
