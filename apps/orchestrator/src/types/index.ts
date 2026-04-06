// Message Types
export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface Conversation {
  id: string;
  messages: Message[];
  context: ConversationContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationContext {
  userName: string;
  systemPrompt: string;
  activeTools: string[];
  lastIntent?: Intent;
}

// Intent Types
export type IntentCategory =
  | "greeting"
  | "music"
  | "lights"
  | "bluetooth"
  | "tasks"
  | "pc_control"
  | "general"
  | "system_info"
  | "weather"
  | "time";

export interface Intent {
  category: IntentCategory;
  confidence: number;
  entities: Record<string, string>;
  requiresTool: boolean;
  toolName?: string;
}

// Tool Types
export interface Tool {
  name: string;
  description: string;
  category: string;
  parameters: ToolParameter[] | { type: "object"; properties: Record<string, unknown>; required?: string[] };
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface ToolCall {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// OpenAI Function Calling Types
export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, OpenAIParameter>;
    required: string[];
  };
}

export interface OpenAIParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

// API Types
export interface ChatRequest {
  conversationId?: string;
  message: string;
  stream?: boolean;
}

export interface ChatResponse {
  conversationId: string;
  message: Message;
  intent?: Intent;
  toolResults?: ToolResult[];
}

export interface StreamChunk {
  type: "text" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
}

// Health Check
export interface HealthResponse {
  ok: boolean;
  timestamp: string;
  version: string;
  services: {
    openai: boolean;
    tools: boolean;
  };
}
