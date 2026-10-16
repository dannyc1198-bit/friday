import { test } from "node:test";
import assert from "node:assert/strict";
import { layout, matchNode, obsidianUri } from "./vault-graph";

const nodes = [
  { id: "People/Kerissa.md", name: "Kerissa", folder: "People", links: 1 },
  { id: "Home.md", name: "Home", folder: "(root)", links: 1 },
];

test("thoughts light the right note", () => {
  assert.equal(matchNode(nodes, "Kerissa", "People/Kerissa.md"), "People/Kerissa.md");
  assert.equal(matchNode(nodes, "home", "C:\\vault\\Home.md"), "Home.md");
  assert.equal(matchNode(nodes, "Kerissa", "Kerissa.md"), "People/Kerissa.md");
  assert.equal(matchNode(nodes, "Nobody", "nothing"), null);
});

test("layout places every node and the URI opens the note", () => {
  assert.equal(layout(nodes).size, 2);
  assert.equal(obsidianUri("Wavelength", "People/Kerissa.md"), "obsidian://open?vault=Wavelength&file=People%2FKerissa");
});