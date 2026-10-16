// Tool registration index â€” SIMPLE FRIDAY (amputated 2026-04-20)
//
// Only the core daily-driver tools are registered. Frozen tool files
// (hue, bluetooth, health-*, music, quiet-mode, identity, memory-tools)
// remain on disk and can be re-enabled by adding their register call back.
//
// memory-tools frozen 2026-07-09: superseded by brain-tools (durable facts)
// + task-manager (reminders). Three overlapping memory systems made the
// flash-class model save facts into the wrong store.
//
// Deleted modules (code-generator, self-upgrade, openclaw-tools, screen-reader,
// agent-tools, sidecar-tools, swarm-tools, content-tools, business-intel,
// code-agent, danclaw-tools, meta-glasses-tools, receptionist, wavelength-tools)
// are gone entirely â€” see the simple-friday branch amputation audit.

import { registerPcControlTools } from "./pc-control.js";
import { registerTaskTools } from "./task-manager.js";
import { registerVaultTools } from "./vault-tools.js";
import { registerBrowserTools } from "./browser-control.js";
import { registerObsidianTools } from "./obsidian.js";
import { registerAgentRouterTools } from "./agent-router.js";
import { registerBrainProviderTools } from "./brain-provider.js";
import { registerLiveAppsTools } from "./live-apps.js";
import { registerMindspaceTools } from "./mindspace.js";
import { registerBrainTools } from "./brain-tools.js";
import { registerCreativeTools } from "./creative.js";
import { registerAppControlTools } from "./app-control.js";
import { registerProceduralSkillTools } from "./procedural-skills.js";
import { toolRegistry } from "./registry.js";

export function initializeTools(): void {
  console.log("ðŸ”§ Initializing FRIDAY tools (simple)...");

  registerPcControlTools();
  console.log("  âœ“ PC Control");

  registerTaskTools();
  console.log("  âœ“ Tasks");

  registerVaultTools();
  console.log("  âœ“ Vault");

  registerBrowserTools();
  console.log("  âœ“ Browser (Playwright)");

  registerObsidianTools();
  console.log("  âœ“ Obsidian (second brain â€” read/write/delete)");

  registerBrainTools();
  registerProceduralSkillTools();
  console.log("  âœ“ Brain (recall / remember / reflect â€” the learning loop)");

  registerCreativeTools();
  console.log("  âœ“ Creative (Meshy, Blender, Higgsfield)");

  registerAgentRouterTools();
  registerBrainProviderTools();
  registerLiveAppsTools();
  registerMindspaceTools();
  console.log("  âœ“ Agents (Codex, Grok code) + brain provider + Mindspace");

  registerAppControlTools();
  console.log("  âœ“ App Control (fleet status/launch/stop/logs + market + intel)");

  const allTools = toolRegistry.getAllTools();
  console.log(`\nðŸ“¦ Total tools available: ${allTools.length}`);
}

export { toolRegistry } from "./registry.js";
export { registerPcControlTools } from "./pc-control.js";
export { registerTaskTools } from "./task-manager.js";
export { registerVaultTools } from "./vault-tools.js";
export { registerBrowserTools } from "./browser-control.js";
export { registerObsidianTools } from "./obsidian.js";
export { registerAppControlTools } from "./app-control.js";
