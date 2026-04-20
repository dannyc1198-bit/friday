// Tool registration index
// This file registers all tool modules with the tool registry

import { registerPcControlTools } from "./pc-control.js";
import { registerHueTools } from "./hue.js";
import { registerBluetoothTools } from "./bluetooth.js";
import { registerHealthTools } from "./health-monitor.js";
import { registerCodingTools } from "./code-generator.js";
import { registerSelfUpgradeTools } from "./self-upgrade.js";
import { registerMemoryTools } from "./memory-tools.js";
import { registerTaskTools } from "./task-manager.js";
import { registerOpenClawTools } from "./openclaw-tools.js";
import { registerBrowserTools } from "./browser-control.js";
import { registerScreenReaderTools } from "./screen-reader.js";
import { registerAgentTools } from "./agent-tools.js";
import { registerSidecarTools } from "./sidecar-tools.js";
import { registerObsidianTools } from "./obsidian.js";
import { registerIdentityTools } from "./identity-tools.js";
import { registerSwarmTools } from "./swarm-tools.js";
import { registerVaultTools } from "./vault-tools.js";
import { registerHealthTrackingTools } from "./health-tracking.js";
import { registerContentTools } from "./content-tools.js";
import { registerBusinessIntelTools } from "./business-intel.js";
import { registerCodeAgentTools } from "./code-agent.js";
import { registerDanClawTools } from "./danclaw-tools.js";
import { registerMetaGlassesTools } from "./meta-glasses-tools.js";
import { registerMusicTools } from "./music-tools.js";
import { registerQuietModeTools } from "./quiet-mode-tools.js";
import { toolRegistry } from "./registry.js";

// Initialize all tools
export function initializeTools(): void {
  console.log("🔧 Initializing JARVIS tools...");

  registerPcControlTools();
  console.log("  ✓ PC Control tools registered");

  registerHueTools();
  console.log("  ✓ Hue tools registered");

  registerBluetoothTools();
  console.log("  ✓ Bluetooth tools registered");

  registerHealthTools();
  console.log("  ✓ Health Monitoring tools registered");

  registerCodingTools();
  console.log("  ✓ Creative Coding tools registered");

  registerSelfUpgradeTools();
  console.log("  ✓ Self-Upgrade tools registered");

  registerMemoryTools();
  console.log("  ✓ Memory tools registered");

  registerTaskTools();
  console.log("  ✓ Task Management tools registered");

  registerOpenClawTools();
  console.log("  ✓ Integration tools registered (Web, Gmail, Notion, VAPI, Files)");

  registerBrowserTools();
  console.log("  ✓ Browser Control tools registered (Playwright)");

  registerScreenReaderTools();
  console.log("  ✓ Screen Reader tools registered (Claude Vision)");

  registerAgentTools();
  console.log("  ✓ Agent Dispatch tools registered (dispatch, status, memory, learning)");

  registerSidecarTools();
  console.log("  ✓ Sidecar tools registered (camera, kitchen, voice, alerts)");

  registerObsidianTools();

  registerIdentityTools();
  console.log("  ✓ Identity tools registered (soul, learning, evolution, autonomy)");

  registerSwarmTools();
  console.log("  ✓ Swarm tools registered (multi-agent orchestration, parallel execution)");

  registerVaultTools();
  console.log("  ✓ Vault tools registered (credential vault management)");

  registerHealthTrackingTools();
  console.log("  ✓ Health Tracking tools registered (weight, workouts, meals)");

  registerContentTools();
  console.log("  ✓ Content Creation tools registered (LinkedIn, YouTube, topic suggestions)");

  registerBusinessIntelTools();
  console.log("  ✓ Business Intelligence tools registered (MRR, leads, Netlify forms)");

  registerCodeAgentTools();
  console.log("  ✓ Code Agent tools registered (build + deploy)");

  registerDanClawTools();
  console.log("  ✓ DanClaw tools registered (dispatch, agents, history, status)");

  registerMetaGlassesTools();
  console.log("  ✓ Meta Glasses Vision tools registered (describe, ask, status, file)");

  registerMusicTools();
  console.log("  ✓ Music tools registered (local library + media keys)");

  registerQuietModeTools();
  console.log("  ✓ Quiet mode tools registered (DND priority filter)");

  const allTools = toolRegistry.getAllTools();
  console.log(`\n📦 Total tools available: ${allTools.length}`);

  // Log tools by category
  const categories = new Map<string, string[]>();
  for (const tool of allTools) {
    if (!categories.has(tool.category)) {
      categories.set(tool.category, []);
    }
    categories.get(tool.category)!.push(tool.name);
  }

  for (const [category, tools] of categories) {
    console.log(`  ${category}: ${tools.join(", ")}`);
  }
}

// Export registry for direct access
export { toolRegistry } from "./registry.js";

// Export individual tool modules for testing
export { registerPcControlTools } from "./pc-control.js";
export { registerHueTools } from "./hue.js";
export { registerBluetoothTools } from "./bluetooth.js";
export { registerHealthTools } from "./health-monitor.js";
export { registerCodingTools } from "./code-generator.js";
export { registerSelfUpgradeTools } from "./self-upgrade.js";
export { registerMemoryTools } from "./memory-tools.js";
export { registerTaskTools } from "./task-manager.js";
export { registerOpenClawTools } from "./openclaw-tools.js";
export { registerBrowserTools } from "./browser-control.js";
export { registerScreenReaderTools } from "./screen-reader.js";
export { registerObsidianTools } from "./obsidian.js";
export { registerIdentityTools } from "./identity-tools.js";
export { registerSwarmTools } from "./swarm-tools.js";
export { registerVaultTools } from "./vault-tools.js";
