import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
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

test("vault writes, dates, and symlinks cannot leave the vault", async () => {
  const escaped = await toolRegistry.execute("obsidian_create", {
    title: "escaped",
    folder: "../../friday-vault-escape",
    content: "nope",
  });
  assert.equal(escaped.success, false);
  assert.equal(existsSync(path.resolve(root, "../../friday-vault-escape/escaped.md")), false);

  const daily = await toolRegistry.execute("obsidian_daily", { date: "../../etc/passwd" });
  assert.equal(daily.success, false);

  const secretDir = mkdtempSync(path.join(os.tmpdir(), "friday-outside-"));
  writeFileSync(path.join(secretDir, "secret.md"), "top secret");
  symlinkSync(path.join(secretDir, "secret.md"), path.join(root, "link.md"));
  const linked = await toolRegistry.execute("obsidian_read", { note: "link" });
  assert.equal(linked.success, false);
  rmSync(secretDir, { recursive: true, force: true });
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

test("a new vault fact is recallable immediately, and profile edits stay proposals", async () => {
  await brain.initBrain();
  const token = `relay-token-${Date.now()}`;
  const observation = `The vault indexed ${token} on write so brain_recall can find this entity note immediately.`;
  const remembered = await brain.rememberFact({
    entity: "Immediate Relay",
    observation,
    type: "fact",
    source: "manual",
  });
  assert.equal(remembered.duplicate, false);
  const hits = brain.searchBrain(token);
  assert.ok(hits.some((hit) => hit.notePath.endsWith("Immediate Relay.md")));

  const { registerBrainTools } = await import("./brain-tools.js");
  registerBrainTools();
  const recalled = await toolRegistry.execute("brain_recall", { query: token, limit: 5 });
  assert.equal(recalled.success, true);
  const rows = (recalled.data as { results: Array<{ path: string; text: string }> }).results;
  assert.ok(rows.some((row) => row.path.includes("Immediate Relay") && row.text.includes(token)));

  const profilePath = path.join(root, "FRIDAY_BRAIN", "DANNY-PROFILE.md");
  const before = readFileSync(profilePath, "utf8");
  const { writeLearningsFromTurn } = await import("../services/learning-writeback.js");
  await writeLearningsFromTurn("My business is Wavelength Solutions, websites and receptionists.");
  assert.equal(readFileSync(profilePath, "utf8"), before);
  const proposal = readFileSync(path.join(root, "FRIDAY_BRAIN", "proposals", "DANNY-PROFILE.md"), "utf8");
  assert.match(proposal, /Wavelength Solutions/);
  assert.match(proposal, /has been copied into DANNY-PROFILE/);
  const danny = readFileSync(path.join(root, "FRIDAY_BRAIN", "entities", "Danny.md"), "utf8");
  assert.match(danny, /Wavelength Solutions/);
  const learned = brain.searchBrain("Wavelength Solutions websites and receptionists");
  assert.ok(learned.some((hit) => hit.notePath.endsWith("Danny.md")));
});
