import { v4 as uuidv4 } from "uuid";
import type {
  Conversation,
  Message,
  ConversationContext,
  ToolCall,
  ToolResult,
} from "../types/index.js";
import { config, FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import { memoryService } from "./memory/index.js";

// In-memory conversation store (replace with DB in production)
const conversations = new Map<string, Conversation>();

const ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

// Create a new conversation
export function createConversation(id?: string): Conversation {
  const conversation: Conversation = {
    id: id && ID_PATTERN.test(id) ? id : uuidv4(),
    messages: [],
    context: {
      userName: config.userName,
      systemPrompt: FRIDAY_SYSTEM_PROMPT,
      activeTools: ["pc_control", "smart_home", "media", "bluetooth"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  conversations.set(conversation.id, conversation);
  return conversation;
}

// Get a conversation by ID
export function getConversation(id: string): Conversation | undefined {
  return conversations.get(id);
}

// Get or create a conversation
export function getOrCreateConversation(id?: string): Conversation {
  if (id && ID_PATTERN.test(id)) {
    const existing = conversations.get(id);
    if (existing) {
      return existing;
    }
  }
  return createConversation(id);
}

export interface TranscriptTurn {
  role: string;
  content: string;
  timestamp?: string;
}

/** Rebuild model context from a persisted transcript when memory was empty. */
export function ensureConversation(id: string | undefined, prior: TranscriptTurn[] = []): Conversation {
  if (id && ID_PATTERN.test(id)) {
    const existing = conversations.get(id);
    if (existing) return existing;
    const conversation = createConversation(id);
    for (const turn of prior) {
      if ((turn.role !== "user" && turn.role !== "assistant") || !turn.content?.trim()) continue;
      conversation.messages.push({
        id: uuidv4(),
        role: turn.role,
        content: turn.content,
        timestamp: turn.timestamp ? new Date(turn.timestamp) : new Date(),
      });
    }
    return conversation;
  }
  return createConversation();
}

// Add a user message
export function addUserMessage(
  conversationId: string,
  content: string
): Message {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const message: Message = {
    id: uuidv4(),
    role: "user",
    content,
    timestamp: new Date(),
  };

  conversation.messages.push(message);
  conversation.updatedAt = new Date();

  // Store to long-term memory (fire-and-forget)
  memoryService
    .storeMessage(conversationId, content, "user", {
      userName: conversation.context.userName,
      intent: conversation.context.lastIntent?.category,
    })
    .catch((err) => console.error("[Conversation] Memory storage failed:", err));

  return message;
}

// Add an assistant message
export function addAssistantMessage(
  conversationId: string,
  content: string,
  toolCalls?: ToolCall[],
  toolResults?: ToolResult[]
): Message {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const message: Message = {
    id: uuidv4(),
    role: "assistant",
    content,
    timestamp: new Date(),
    toolCalls,
    toolResults,
  };

  conversation.messages.push(message);
  conversation.updatedAt = new Date();

  // Store to long-term memory (fire-and-forget)
  const toolsUsed = toolCalls?.map((tc) => tc.toolName);
  memoryService
    .storeMessage(conversationId, content, "assistant", {
      toolsUsed,
    })
    .catch((err) => console.error("[Conversation] Memory storage failed:", err));

  return message;
}

// Get messages for a conversation
export function getMessages(conversationId: string): Message[] {
  const conversation = conversations.get(conversationId);
  return conversation?.messages || [];
}

// Update conversation context
export function updateContext(
  conversationId: string,
  updates: Partial<ConversationContext>
): void {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.context = { ...conversation.context, ...updates };
    conversation.updatedAt = new Date();
  }
}

// Clear old conversations (cleanup)
export function cleanupOldConversations(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [id, conversation] of conversations) {
    if (now - conversation.updatedAt.getTime() > maxAgeMs) {
      conversations.delete(id);
    }
  }
}

// Get conversation count
export function getConversationCount(): number {
  return conversations.size;
}

// Delete a conversation
export function deleteConversation(id: string): boolean {
  return conversations.delete(id);
}
