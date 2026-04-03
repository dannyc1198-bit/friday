// Memory Types for ChromaDB Long-Term Memory

export interface MemoryDocument {
  id: string;
  conversationId: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  userName?: string;
  intent?: string;
  toolsUsed?: string[];
  topics?: string[];
  sentiment?: "positive" | "neutral" | "negative";
  importance?: "low" | "medium" | "high";
}

export interface MemorySearchResult {
  document: MemoryDocument;
  similarity: number;
  distance: number;
}

export interface HistoricalContext {
  relevantMemories: MemorySearchResult[];
  summary: string;
  topics: string[];
  userPreferences: Record<string, string>;
}

export interface ChromaStatus {
  connected: boolean;
  host: string;
  port: number;
  collection: string;
  documentCount: number;
  lastHealthCheck: Date;
  error?: string;
}

export interface StoreMessageOptions {
  userName?: string;
  intent?: string;
  toolsUsed?: string[];
  topics?: string[];
  importance?: "low" | "medium" | "high";
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  timeRangeStart?: Date;
  timeRangeEnd?: Date;
  role?: "user" | "assistant";
  conversationId?: string;
}

export interface UserPreference {
  category: string;
  preference: string;
  timestamp: Date;
  confidence: number;
}
