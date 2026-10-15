import type { Tool, ToolResult } from "../types/index.js";
import { isOutboundTool } from "../services/intent-router.js";

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  // Register a tool
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  // Get a tool by name
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  // Get all tools
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Get tools by category
  getToolsByCategory(category: string): Tool[] {
    return this.getAllTools().filter((t) => t.category === category);
  }

  // Execute a tool
  async execute(
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);

    if (isOutboundTool(toolName)) {
      return {
        toolCallId: "",
        success: false,
        error: `Refused "${toolName}". Messages, spending, and live trades stay drafts until Danny explicitly approves one.`,
      };
    }

    if (!tool) {
      return {
        toolCallId: "",
        success: false,
        error: `Tool "${toolName}" not found`,
      };
    }

    try {
      console.log(`[ToolRegistry] Executing tool: ${toolName}`);
      const result = await tool.execute(parameters);
      console.log(`[ToolRegistry] Tool result: ${toolName} ${result.success ? "ok" : "failed"}`);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[ToolRegistry] Tool execution failed:`, errorMessage);
      return {
        toolCallId: "",
        success: false,
        error: errorMessage,
      };
    }
  }

  // Check if tools are available
  hasTools(): boolean {
    return this.tools.size > 0;
  }

  // Get tool count
  getToolCount(): number {
    return this.tools.size;
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
