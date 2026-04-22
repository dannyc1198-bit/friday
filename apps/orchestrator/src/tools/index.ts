// Tool registration index — SIMPLE FRIDAY (amputated 2026-04-20)
//
// Only the core daily-driver tools are registered. Frozen tool files
// (hue, bluetooth, obsidian, health-*, music, quiet-mode, identity)
// remain on disk and can be re-enabled by adding their register call back.
//
// Deleted modules (code-generator, self-upgrade, openclaw-tools, screen-reader,
// agent-tools, sidecar-tools, swarm-tools, content-tools, business-intel,
// code-agent, danclaw-tools, meta-glasses-tools, receptionist, wavelength-tools)
// are gone entirely — see the simple-friday branch amputation audit.

import { registerPcControlTools } from "./pc-control.js";
import { registerMemoryTools } from "./memory-tools.js";
import { registerTaskTools } from "./task-manager.js";
import { registerVaultTools } from "./vault-tools.js";
import { registerBrowserTools } from "./browser-control.js";
import { toolRegistry } from "./registry.js";

export function initializeTools(): void {
  console.log("🔧 Initializing FRIDAY tools (simple)...");

  registerPcControlTools();
  console.log("  ✓ PC Control");

  registerMemoryTools();
  console.log("  ✓ Memory");

  registerTaskTools();
  console.log("  ✓ Tasks");

  registerVaultTools();
  console.log("  ✓ Vault");

  registerBrowserTools();
  console.log("  ✓ Browser (Playwright)");

  const allTools = toolRegistry.getAllTools();
  console.log(`\n📦 Total tools available: ${allTools.length}`);
}

export { toolRegistry } from "./registry.js";
export { registerPcControlTools } from "./pc-control.js";
export { registerMemoryTools } from "./memory-tools.js";
export { registerTaskTools } from "./task-manager.js";
export { registerVaultTools } from "./vault-tools.js";
export { registerBrowserTools } from "./browser-control.js";
