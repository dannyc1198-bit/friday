import { v4 as uuidv4 } from "uuid";
import { config } from "../../config/index.js";
import { chromaClient } from "./chroma-client.js";
import { fileMemoryClient } from "./file-memory-client.js";
import { embed } from "./embedding.js";
import type {
  MemoryDocument,
  MemorySearchResult,
  HistoricalContext,
  ChromaStatus,
  StoreMessageOptions,
  SearchOptions,
  UserPreference,
} from "./types.js";

// Memory client interface (works with both ChromaDB and file-based)
interface MemoryClient {
  connect(): Promise<boolean>;
  isConnected(): boolean;
  getStatus(): ChromaStatus;
  addDocuments(documents: MemoryDocument[], embeddings: number[][]): Promise<void>;
  queryByEmbedding(embedding: number[], limit: number, where?: Record<string, unknown>): Promise<MemorySearchResult[]>;
  deleteByConversationId(conversationId: string): Promise<number>;
  deleteOldDocuments(retentionDays: number): Promise<number>;
  healthCheck(): Promise<boolean>;
}

// Main Memory Service for JARVIS
class MemoryService {
  private initialized: boolean = false;
  private backend: "file" | "chroma" = "file";
  private userPreferences: Map<string, UserPreference> = new Map();
  private client: MemoryClient = fileMemoryClient;

  // Initialize the memory service
  async initialize(): Promise<boolean> {
    console.log("[Memory] Local file memory is the default. Chroma is optional.");
    const fileOk = await fileMemoryClient.connect();
    this.client = fileMemoryClient;
    this.backend = "file";

    if (config.chroma.enabled) {
      const connected = await Promise.race([
        chromaClient.connect(1),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500)),
      ]);
      if (connected) {
        this.client = chromaClient;
        this.backend = "chroma";
        console.log("[Memory] Chroma is up. Using it for chat memory.");
      } else {
        console.log(
          `[Memory] Chroma unreachable at ${config.chroma.host}:${config.chroma.port}. Using file memory (${fileMemoryClient.getStatus().documentCount} items). Set CHROMA_ENABLED=false to skip this probe.`
        );
      }
    } else {
      console.log(
        `[Memory] Chroma is off. File memory has ${fileMemoryClient.getStatus().documentCount} items. The Obsidian vault is the brain; this store is chat memory only.`
      );
    }

    this.initialized = fileOk || this.backend === "chroma";
    if (this.initialized) this.scheduleCleanup();
    return this.initialized;
  }

  getMemoryReport(): { backend: string; count: number; detail: string } {
    const status = this.client.getStatus();
    const count = status.documentCount ?? 0;
    const detail = this.backend === "chroma"
      ? `Chroma ${status.host}:${status.port} (${count})`
      : `file memory (${count}). Chroma ${config.chroma.enabled ? "unreachable" : "off"}.`;
    return { backend: this.backend, count, detail };
  }

  isAvailable(): boolean {
    return this.initialized && this.client.isConnected();
  }

  getStatus(): ChromaStatus {
    return this.client.getStatus();
  }


  // Store a message in long-term memory
  async storeMessage(
    conversationId: string,
    content: string,
    role: "user" | "assistant",
    options: StoreMessageOptions = {}
  ): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      if (content.length < 10) {
        return null;
      }

      let embedding: number[] = [];
      try {
        embedding = await embed(content);
      } catch {
        embedding = [];
      }

      const document: MemoryDocument = {
        id: uuidv4(),
        conversationId,
        content,
        role,
        timestamp: new Date(),
        metadata: {
          userName: options.userName,
          intent: options.intent,
          toolsUsed: options.toolsUsed,
          topics: options.topics,
          importance: options.importance || this.assessImportance(content),
        },
      };

      await this.client.addDocuments([document], [embedding]);
      console.log(`[MemoryService] Stored memory: ${document.id}`);
      return document.id;
    } catch (error) {
      console.error("[MemoryService] Failed to store message:", error);
      return null;
    }
  }


  // Search memories semantically
  async searchMemories(
    query: string,
    options: SearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      let embedding: number[] = [];
      try {
        embedding = await embed(query);
      } catch {
        embedding = [];
      }
      if (!embedding.length && this.client === fileMemoryClient) {
        return fileMemoryClient.searchByText(query, options.limit || config.chroma.contextMemoryLimit);
      }
      const limit = options.limit || config.chroma.contextMemoryLimit;
      const minSimilarity = options.minSimilarity || config.chroma.minSimilarity;

      const where: Record<string, unknown> = {};
      if (options.role) where.role = options.role;
      if (options.conversationId) where.conversationId = options.conversationId;

      const results = await this.client.queryByEmbedding(
        embedding,
        limit * 2,
        Object.keys(where).length > 0 ? where : undefined
      );

      let filtered = results.filter((r) => r.similarity >= minSimilarity);

      if (options.timeRangeStart) {
        filtered = filtered.filter((r) => r.document.timestamp >= options.timeRangeStart!);
      }
      if (options.timeRangeEnd) {
        filtered = filtered.filter((r) => r.document.timestamp <= options.timeRangeEnd!);
      }

      return filtered.slice(0, limit);
    } catch (error) {
      console.error("[MemoryService] Search failed:", error);
      return [];
    }
  }


  // Build historical context for prompt injection
  async buildHistoricalContext(
    currentMessage: string,
    conversationId?: string
  ): Promise<HistoricalContext | null> {
    if (!this.isAvailable()) return null;

    try {
      const memories = await this.searchMemories(currentMessage, {
        limit: config.chroma.contextMemoryLimit,
      });

      if (memories.length === 0) return null;

      const topicsSet = new Set<string>();
      memories.forEach((m) => {
        m.document.metadata.topics?.forEach((t) => topicsSet.add(t));
      });

      const summary = this.buildContextSummary(memories);

      const userPreferences: Record<string, string> = {};
      this.userPreferences.forEach((pref, key) => {
        userPreferences[key] = pref.preference;
      });

      return {
        relevantMemories: memories,
        summary,
        topics: Array.from(topicsSet),
        userPreferences,
      };
    } catch (error) {
      console.error("[MemoryService] Failed to build context:", error);
      return null;
    }
  }

  // Store a user preference
  async storePreference(category: string, preference: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const pref: UserPreference = {
        category,
        preference,
        timestamp: new Date(),
        confidence: 1.0,
      };

      this.userPreferences.set(category, pref);

      await this.storeMessage("preferences", `User preference - ${category}: ${preference}`, "user", {
        topics: ["preference", category],
        importance: "high",
      });

      console.log(`[MemoryService] Stored preference: ${category} = ${preference}`);
      return true;
    } catch (error) {
      console.error("[MemoryService] Failed to store preference:", error);
      return false;
    }
  }


  // Get recent conversation summaries
  async getRecentSummaries(days: number = 7): Promise<string[]> {
    if (!this.isAvailable()) return [];

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const memories = await this.searchMemories("conversation summary", {
        limit: 20,
        timeRangeStart: startDate,
      });

      const conversationGroups = new Map<string, MemorySearchResult[]>();
      memories.forEach((m) => {
        const existing = conversationGroups.get(m.document.conversationId) || [];
        existing.push(m);
        conversationGroups.set(m.document.conversationId, existing);
      });

      const summaries: string[] = [];
      conversationGroups.forEach((group) => {
        const date = group[0].document.timestamp.toLocaleDateString();
        const topics = new Set<string>();
        group.forEach((m) => m.document.metadata.topics?.forEach((t) => topics.add(t)));
        const topicList = Array.from(topics).slice(0, 3).join(", ");
        summaries.push(`${date}: Discussed ${topicList || "general topics"}`);
      });

      return summaries;
    } catch (error) {
      console.error("[MemoryService] Failed to get summaries:", error);
      return [];
    }
  }

  // Delete conversation from memory
  async deleteConversation(conversationId: string): Promise<number> {
    if (!this.isAvailable()) return 0;

    try {
      const deleted = await this.client.deleteByConversationId(conversationId);
      console.log(`[MemoryService] Deleted ${deleted} memories`);
      return deleted;
    } catch (error) {
      console.error("[MemoryService] Failed to delete conversation:", error);
      return 0;
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.client.healthCheck();
  }


  private assessImportance(content: string): "low" | "medium" | "high" {
    const lower = content.toLowerCase();

    if (
      lower.includes("remember") ||
      lower.includes("important") ||
      lower.includes("always") ||
      lower.includes("never") ||
      lower.includes("preference") ||
      lower.includes("my name") ||
      lower.includes("i like") ||
      lower.includes("i hate") ||
      lower.includes("i prefer")
    ) {
      return "high";
    }

    if (
      lower.includes("hi") ||
      lower.includes("hello") ||
      lower.includes("thanks") ||
      lower.includes("ok") ||
      content.length < 50
    ) {
      return "low";
    }

    return "medium";
  }

  private buildContextSummary(memories: MemorySearchResult[]): string {
    if (memories.length === 0) return "";

    const dates = memories.map((m) => m.document.timestamp);
    const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
    const newest = new Date(Math.max(...dates.map((d) => d.getTime())));

    const parts: string[] = [
      `Found ${memories.length} relevant past conversations from ${oldest.toLocaleDateString()} to ${newest.toLocaleDateString()}.`
    ];

    const highImportance = memories.filter((m) => m.document.metadata.importance === "high");
    if (highImportance.length > 0) {
      parts.push(
        `Key memories: ${highImportance.slice(0, 2).map((m) => m.document.content.slice(0, 100)).join("; ")}`
      );
    }

    return parts.join(" ");
  }

  private scheduleCleanup(): void {
    setInterval(
      async () => {
        try {
          const deleted = await this.client.deleteOldDocuments(config.chroma.retentionDays);
          if (deleted > 0) {
            console.log(`[MemoryService] Cleaned up ${deleted} old memories`);
          }
        } catch (error) {
          console.error("[MemoryService] Cleanup failed:", error);
        }
      },
      24 * 60 * 60 * 1000
    );
  }
}

// Singleton export
export const memoryService = new MemoryService();
