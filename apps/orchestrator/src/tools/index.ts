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
