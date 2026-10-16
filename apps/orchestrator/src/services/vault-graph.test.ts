import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildVaultGraph, extractLinks, readVaultNote } from "./vault-graph.js";

test("vault graph: every note is a node and wiki links become edges", () => {
  const root = mkdtempSync(join(tmpdir(), "friday-graph-"));
  mkdirSync(join(root, "People"));
  writeFileSync(join(root, "Home.md"), "See [[Kerissa]] and [[Missing]] and [[People/Kerissa|K]].");
  writeFileSync(join(root, "People", "Kerissa.md"), "Back to [[Home#top]].");
  const graph = buildVaultGraph(root, 1);
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges.sort(), [["Home.md", "People/Kerissa.md"], ["People/Kerissa.md", "Home.md"]].sort());
  assert.deepEqual(extractLinks("[[A|b]] [[C#h]]"), ["A", "C"]);
  assert.equal(readVaultNote(root, "People/Kerissa.md")?.content, "Back to [[Home#top]].");
  assert.equal(readVaultNote(root, "../secret.md"), null);
});