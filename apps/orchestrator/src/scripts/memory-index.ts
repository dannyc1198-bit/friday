import { getMemoryPort, startMemoryBackground } from "../services/memory/port.js";

const command = process.argv[2] || "index";
const port = getMemoryPort();

if (command === "reindex") {
  const result = await port.reindex();
  console.log(JSON.stringify(result, null, 2));
  port.close();
} else if (command === "watch") {
  startMemoryBackground();
  console.log("Memory index is watching. Leave this window open.");
  await new Promise(() => undefined);
} else {
  const result = await port.indexAll();
  console.log(JSON.stringify({ ...result, sources: port.sources() }, null, 2));
  port.close();
}
