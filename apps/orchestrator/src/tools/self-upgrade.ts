import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { memoryService } from "../services/memory/index.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Self-Upgrade System for JARVIS
// Monitors capabilities, suggests improvements, and helps integrate new features

interface UpgradeModule {
  id: string;
  name: string;
  description: string;
  category: "performance" | "capability" | "integration" | "security" | "ui";
  priority: "low" | "medium" | "high" | "critical";
  status: "available" | "installed" | "updating" | "deprecated";
  version: string;
  dependencies: string[];
  installCommand?: string;
  configRequired?: Record<string, string>;
  benefits: string[];
  estimatedImpact: string;
}

interface SystemDiagnostics {
  uptime: number;
  memoryUsage: number;
  cpuLoad: number;
  toolsRegistered: number;
  requestsHandled: number;
  avgResponseTime: number;
  errorRate: number;
  lastUpdated: Date;
}

// Available upgrade modules
const AVAILABLE_UPGRADES: UpgradeModule[] = [
  {
    id: "memory-chromadb",
    name: "Long-Term Memory (ChromaDB)",
    description: "Vector database for storing and retrieving conversation history up to 30+ days",
    category: "capability",
    priority: "high",
    status: "available",
    version: "1.0.0",
    dependencies: ["chromadb", "@anthropic-ai/sdk"],
    installCommand: "npm install chromadb",
    configRequired: {
      CHROMA_HOST: "localhost",
      CHROMA_PORT: "8000",
    },
    benefits: [
      "Remember conversations for 30+ days",
      "Semantic search through past interactions",
      "Learn user preferences over time",
      "Context-aware responses based on history",
    ],
    estimatedImpact: "30% improvement in personalization",
  },
  {
    id: "web-research-tavily",
    name: "Web Research Engine (Tavily)",
    description: "Real-time web search and research capabilities for up-to-date information",
    category: "capability",
    priority: "high",
    status: "available",
    version: "1.0.0",
    dependencies: [],
    configRequired: {
      TAVILY_API_KEY: "your-api-key",
    },
    benefits: [
      "Real-time web search",
      "Research complex topics instantly",
      "Access current news and events",
      "Fact-check information",
    ],
    estimatedImpact: "50% improvement in knowledge accuracy",
  },
  {
    id: "voice-whisper",
    name: "Voice Recognition (Whisper)",
    description: "OpenAI Whisper for accurate speech-to-text conversion",
    category: "capability",
    priority: "high",
    status: "available",
    version: "1.0.0",
    dependencies: ["openai"],
    configRequired: {
      OPENAI_API_KEY: "already-configured",
    },
    benefits: [
      "Voice command support",
      "Hands-free operation",
      "Multi-language support",
      "Background noise handling",
    ],
    estimatedImpact: "Enables full voice control",
  },
  {
    id: "3d-printing-octoprint",
    name: "3D Printing Control (OctoPrint)",
    description: "Control 3D printers through OctoPrint API",
    category: "integration",
    priority: "medium",
    status: "available",
    version: "1.0.0",
    dependencies: [],
    configRequired: {
      OCTOPRINT_URL: "http://your-octoprint:5000",
      OCTOPRINT_API_KEY: "your-api-key",
    },
    benefits: [
      "Start/stop/pause 3D prints",
      "Monitor print progress",
      "Adjust temperatures remotely",
      "Receive print completion alerts",
    ],
    estimatedImpact: "Full 3D printer automation",
  },
  {
    id: "blender-integration",
    name: "Blender 3D Integration",
    description: "Connect to Blender 5.0 for AI-assisted 3D modeling",
    category: "integration",
    priority: "medium",
    status: "available",
    version: "1.0.0",
    dependencies: [],
    configRequired: {
      BLENDER_PATH: "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe",
    },
    benefits: [
      "Generate 3D models from text prompts",
      "Automate repetitive modeling tasks",
      "Batch render management",
      "Scene manipulation via voice",
    ],
    estimatedImpact: "10x faster 3D workflow",
  },
  {
    id: "fast-inference",
    name: "Lightning Fast Inference (Groq)",
    description: "Use Groq LPU for ultra-fast AI responses",
    category: "performance",
    priority: "high",
    status: "available",
    version: "1.0.0",
    dependencies: ["groq-sdk"],
    installCommand: "npm install groq-sdk",
    configRequired: {
      GROQ_API_KEY: "your-groq-api-key",
    },
    benefits: [
      "10x faster response times",
      "Lower latency for voice interactions",
      "Reduced API costs",
      "Better real-time conversations",
    ],
    estimatedImpact: "Response time under 500ms",
  },
  {
    id: "email-integration",
    name: "Email Management (Gmail/Outlook)",
    description: "Full email integration for reading, composing, and managing emails",
    category: "integration",
    priority: "medium",
    status: "available",
    version: "1.0.0",
    dependencies: ["googleapis", "@microsoft/microsoft-graph-client"],
    configRequired: {
      GOOGLE_CLIENT_ID: "your-client-id",
      GOOGLE_CLIENT_SECRET: "your-client-secret",
    },
    benefits: [
      "Read and summarize emails",
      "Compose and send emails via voice",
      "Smart email prioritization",
      "Calendar integration",
    ],
    estimatedImpact: "50% reduction in email management time",
  },
  {
    id: "calendar-sync",
    name: "Calendar Synchronization",
    description: "Sync with Google Calendar, Outlook, and Apple Calendar",
    category: "integration",
    priority: "medium",
    status: "available",
    version: "1.0.0",
    dependencies: ["googleapis"],
    configRequired: {},
    benefits: [
      "Schedule management",
      "Meeting reminders",
      "Conflict detection",
      "Smart scheduling suggestions",
    ],
    estimatedImpact: "Never miss a meeting",
  },
  {
    id: "security-vault",
    name: "Secure Credential Vault",
    description: "Encrypted storage for passwords and API keys",
    category: "security",
    priority: "high",
    status: "available",
    version: "1.0.0",
    dependencies: ["node-keytar"],
    benefits: [
      "Encrypted credential storage",
      "Secure account access",
      "Auto-fill capabilities",
      "Biometric unlock support",
    ],
    estimatedImpact: "Enterprise-grade security",
  },
  {
    id: "desktop-electron",
    name: "Desktop Application (Electron)",
    description: "Native desktop app with system tray, global hotkeys, and notifications",
    category: "ui",
    priority: "high",
    status: "available",
    version: "1.0.0",
    dependencies: ["electron", "electron-builder"],
    benefits: [
      "Native desktop experience",
      "System tray icon",
      "Global keyboard shortcuts",
      "Native notifications",
      "Always-on availability",
    ],
    estimatedImpact: "Professional desktop AI assistant",
  },
  {
    id: "thinking-loop",
    name: "Ralph Wiggum Thinking Loop",
    description: "Continuous iteration pattern for complex task completion",
    category: "capability",
    priority: "high",
    status: "available",
    version: "1.0.0",
    dependencies: [],
    benefits: [
      "Persistent problem solving",
      "Self-correcting behavior",
      "Complex task automation",
      "Higher success rate on difficult tasks",
    ],
    estimatedImpact: "10x improvement in complex task completion",
  },
];

// System diagnostics tracking
let systemDiagnostics: SystemDiagnostics = {
  uptime: 0,
  memoryUsage: 0,
  cpuLoad: 0,
  toolsRegistered: 0,
  requestsHandled: 0,
  avgResponseTime: 0,
  errorRate: 0,
  lastUpdated: new Date(),
};

// Track installed upgrades
const installedUpgrades: Set<string> = new Set();

// Helper to check if an upgrade is installed
function isUpgradeInstalled(upgradeId: string): boolean {
  // Check dynamically for memory-chromadb
  if (upgradeId === "memory-chromadb") {
    return memoryService.isAvailable();
  }
  return installedUpgrades.has(upgradeId);
}

// Get Available Upgrades Tool
const getUpgradesTool: Tool = {
  name: "get_upgrades",
  description: "Lists all available upgrades and improvements for JARVIS",
  category: "system",
  parameters: [
    {
      name: "category",
      type: "string",
      description: "Filter by category: performance, capability, integration, security, ui, or 'all'",
      required: false,
      default: "all",
    },
    {
      name: "priority",
      type: "string",
      description: "Filter by priority: low, medium, high, critical, or 'all'",
      required: false,
      default: "all",
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const category = params.category as string || "all";
    const priority = params.priority as string || "all";

    let upgrades = AVAILABLE_UPGRADES.filter(u => !isUpgradeInstalled(u.id));

    if (category !== "all") {
      upgrades = upgrades.filter(u => u.category === category);
    }

    if (priority !== "all") {
      upgrades = upgrades.filter(u => u.priority === priority);
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    upgrades.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Get list of installed upgrades
    const installed = AVAILABLE_UPGRADES
      .filter(u => isUpgradeInstalled(u.id))
      .map(u => u.id);

    return {
      toolCallId: "",
      success: true,
      data: {
        upgrades,
        totalAvailable: upgrades.length,
        installed,
        recommendations: upgrades
          .filter(u => u.priority === "high" || u.priority === "critical")
          .slice(0, 3)
          .map(u => `${u.name}: ${u.benefits[0]}`),
        message: `Found ${upgrades.length} available upgrades`,
      },
    };
  },
};

// Suggest Upgrades Tool - Proactive recommendations
const suggestUpgradesTool: Tool = {
  name: "suggest_upgrades",
  description: "Analyzes current usage and suggests the most impactful upgrades",
  category: "system",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    // Analyze current system state
    const analysis = {
      missingCapabilities: [] as string[],
      performanceBottlenecks: [] as string[],
      securityGaps: [] as string[],
    };

    // Check what's missing
    if (!isUpgradeInstalled("memory-chromadb")) {
      analysis.missingCapabilities.push("Long-term memory - I can't remember our past conversations");
    }
    if (!isUpgradeInstalled("web-research-tavily")) {
      analysis.missingCapabilities.push("Web research - I can't look up current information");
    }
    if (!isUpgradeInstalled("voice-whisper")) {
      analysis.missingCapabilities.push("Voice recognition - You can't talk to me hands-free");
    }
    if (!isUpgradeInstalled("fast-inference")) {
      analysis.performanceBottlenecks.push("Response speed could be 10x faster with Groq");
    }
    if (!isUpgradeInstalled("security-vault")) {
      analysis.securityGaps.push("Credentials are not encrypted");
    }

    // Generate top recommendations
    const topRecommendations = AVAILABLE_UPGRADES
      .filter(u => !isUpgradeInstalled(u.id))
      .filter(u => u.priority === "high" || u.priority === "critical")
      .slice(0, 5);

    return {
      toolCallId: "",
      success: true,
      data: {
        analysis,
        topRecommendations: topRecommendations.map(u => ({
          id: u.id,
          name: u.name,
          reason: u.benefits[0],
          impact: u.estimatedImpact,
          priority: u.priority,
        })),
        message: `I recommend ${topRecommendations.length} upgrades to enhance my capabilities`,
        proactiveMessage: topRecommendations.length > 0
          ? `Sir, I've identified ${topRecommendations.length} upgrades that would significantly improve my capabilities. The top priority is "${topRecommendations[0].name}" which would ${topRecommendations[0].benefits[0].toLowerCase()}. Shall I provide installation instructions?`
          : "All recommended upgrades are already installed. I'm operating at optimal capacity.",
      },
    };
  },
};

// Install Upgrade Tool
const installUpgradeTool: Tool = {
  name: "install_upgrade",
  description: "Provides instructions to install a specific upgrade module",
  category: "system",
  parameters: [
    {
      name: "upgrade_id",
      type: "string",
      description: "The ID of the upgrade to install",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const upgradeId = params.upgrade_id as string;
    const upgrade = AVAILABLE_UPGRADES.find(u => u.id === upgradeId);

    if (!upgrade) {
      return {
        toolCallId: "",
        success: false,
        error: `Upgrade "${upgradeId}" not found. Use get_upgrades to see available options.`,
      };
    }

    if (isUpgradeInstalled(upgradeId)) {
      return {
        toolCallId: "",
        success: false,
        error: `Upgrade "${upgrade.name}" is already installed.`,
      };
    }

    // Generate installation instructions
    const instructions: string[] = [];

    if (upgrade.dependencies.length > 0) {
      instructions.push(`1. Install dependencies: npm install ${upgrade.dependencies.join(" ")}`);
    }

    if (upgrade.installCommand) {
      instructions.push(`2. Run: ${upgrade.installCommand}`);
    }

    if (upgrade.configRequired && Object.keys(upgrade.configRequired).length > 0) {
      instructions.push("3. Add to .env file:");
      Object.entries(upgrade.configRequired).forEach(([key, value]) => {
        instructions.push(`   ${key}=${value}`);
      });
    }

    instructions.push(`4. Restart JARVIS orchestrator`);

    return {
      toolCallId: "",
      success: true,
      data: {
        upgrade,
        instructions,
        estimatedTime: "5-10 minutes",
        message: `Ready to install "${upgrade.name}"`,
        nextSteps: instructions,
      },
    };
  },
};

// System Diagnostics Tool
const systemDiagnosticsTool: Tool = {
  name: "system_diagnostics",
  description: "Gets current system health and performance metrics",
  category: "system",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    // Update diagnostics
    const memUsage = process.memoryUsage();
    systemDiagnostics = {
      uptime: process.uptime(),
      memoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024),
      cpuLoad: (() => { const cpus = os.cpus(); return cpus.reduce((sum, cpu) => sum + (1 - cpu.times.idle / Object.values(cpu.times).reduce((a, b) => a + b, 0)), 0) / cpus.length * 100; })(),
      toolsRegistered: toolRegistry.getToolCount(),
      requestsHandled: systemDiagnostics.requestsHandled,
      avgResponseTime: systemDiagnostics.requestsHandled > 0 ? systemDiagnostics.avgResponseTime : 0,
      errorRate: 0,
      lastUpdated: new Date(),
    };

    const healthScore = calculateHealthScore(systemDiagnostics);

    return {
      toolCallId: "",
      success: true,
      data: {
        diagnostics: {
          ...systemDiagnostics,
          uptimeFormatted: formatUptime(systemDiagnostics.uptime),
          memoryFormatted: `${systemDiagnostics.memoryUsage} MB`,
        },
        healthScore,
        healthStatus: healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : healthScore >= 40 ? "Fair" : "Needs Attention",
        installedUpgrades: Array.from(installedUpgrades),
        recommendations: healthScore < 80
          ? ["Consider installing performance upgrades", "Check error logs"]
          : ["System operating optimally"],
      },
    };
  },
};

// Self-Improvement Report Tool
const selfImprovementReportTool: Tool = {
  name: "self_improvement_report",
  description: "Generates a comprehensive report on potential improvements and current capabilities",
  category: "system",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const totalUpgrades = AVAILABLE_UPGRADES.length;
    const installedCount = AVAILABLE_UPGRADES.filter(u => isUpgradeInstalled(u.id)).length;
    const availableCount = totalUpgrades - installedCount;

    const capabilityGaps = AVAILABLE_UPGRADES
      .filter(u => !isUpgradeInstalled(u.id))
      .filter(u => u.category === "capability");

    const securityGaps = AVAILABLE_UPGRADES
      .filter(u => !isUpgradeInstalled(u.id))
      .filter(u => u.category === "security");

    const report = {
      summary: {
        installedUpgrades: installedCount,
        availableUpgrades: availableCount,
        completionPercentage: Math.round((installedCount / totalUpgrades) * 100),
      },
      currentCapabilities: {
        chat: true,
        pcControl: true,
        smartHome: true,
        media: true,
        bluetooth: true,
        health: true,
        coding: true,
        maps: true,
        memory: isUpgradeInstalled("memory-chromadb"),
        webResearch: isUpgradeInstalled("web-research-tavily"),
        voice: isUpgradeInstalled("voice-whisper"),
        email: isUpgradeInstalled("email-integration"),
        printing3d: isUpgradeInstalled("3d-printing-octoprint"),
        blender: isUpgradeInstalled("blender-integration"),
      },
      priorityUpgrades: AVAILABLE_UPGRADES
        .filter(u => !isUpgradeInstalled(u.id))
        .filter(u => u.priority === "high" || u.priority === "critical"),
      capabilityGaps: capabilityGaps.map(u => u.name),
      securityGaps: securityGaps.map(u => u.name),
      recommendations: [
        "Install long-term memory for personalized interactions",
        "Add web research for real-time information",
        "Enable voice control for hands-free operation",
        "Consider Groq integration for faster responses",
      ],
    };

    return {
      toolCallId: "",
      success: true,
      data: {
        report,
        message: `JARVIS is at ${report.summary.completionPercentage}% capability. ${availableCount} upgrades available.`,
        narrative: `Sir, I'm currently operating at ${report.summary.completionPercentage}% of my potential capabilities. I have ${availableCount} upgrade modules available that could significantly enhance my abilities. The most impactful would be ${capabilityGaps[0]?.name || "already installed"}. Would you like me to detail the installation process?`,
      },
    };
  },
};

// Helper functions
function calculateHealthScore(diagnostics: SystemDiagnostics): number {
  let score = 100;

  // Memory impact
  if (diagnostics.memoryUsage > 500) score -= 10;
  if (diagnostics.memoryUsage > 1000) score -= 20;

  // Response time impact
  if (diagnostics.avgResponseTime > 500) score -= 10;
  if (diagnostics.avgResponseTime > 1000) score -= 20;

  // Error rate impact
  if (diagnostics.errorRate > 1) score -= 10;
  if (diagnostics.errorRate > 5) score -= 30;

  return Math.max(0, score);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Register all self-upgrade tools
export function registerSelfUpgradeTools(): void {
  toolRegistry.register(getUpgradesTool);
  toolRegistry.register(suggestUpgradesTool);
  toolRegistry.register(installUpgradeTool);
  toolRegistry.register(systemDiagnosticsTool);
  toolRegistry.register(selfImprovementReportTool);
}
