import { ChromaClient, Collection } from "chromadb";
import { config } from "../../config/index.js";
import type { MemoryDocument, ChromaStatus, MemorySearchResult } from "./types.js";
import { getEmbeddingDimension } from "./embedding.js";

// ChromaDB client wrapper with connection management
class ChromaClientWrapper {
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private status: ChromaStatus = {
    connected: false,
    host: config.chroma.host,
    port: config.chroma.port,
    collection: config.chroma.collection,
    documentCount: 0,
    lastHealthCheck: new Date(),
  };

  // Initialize connection with retry logic
  async connect(maxRetries: number = 3): Promise<boolean> {
    if (!config.chroma.enabled) {
      console.log("[ChromaDB] Memory system disabled via config");
      return false;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ChromaDB] Connection attempt ${attempt}/${maxRetries}...`);

        this.client = new ChromaClient({
          path: `http://${config.chroma.host}:${config.chroma.port}`,
        });

        // Verify connection by getting version
        await this.client.heartbeat();

        // Get or create collection
        this.collection = await this.client.getOrCreateCollection({
          name: config.chroma.collection,
          metadata: {
            description: "JARVIS long-term memory storage",
            "hnsw:space": "cosine",
          },
        });

        // Get document count
        const count = await this.collection.count();

        this.status = {
          connected: true,
          host: config.chroma.host,
          port: config.chroma.port,
          collection: config.chroma.collection,
          documentCount: count,
          lastHealthCheck: new Date(),
        };

        console.log(`[ChromaDB] Connected successfully. Collection: ${config.chroma.collection}, Documents: ${count}`);
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[ChromaDB] Connection attempt ${attempt} failed:`, errorMsg);

        this.status = {
          ...this.status,
          connected: false,
          lastHealthCheck: new Date(),
          error: errorMsg,
        };

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    return false;
  }

  // Check if connected
  isConnected(): boolean {
    return this.status.connected && this.collection !== null;
  }

  // Get current status
  getStatus(): ChromaStatus {
    return { ...this.status };
  }

  // Add documents to collection
  async addDocuments(documents: MemoryDocument[], embeddings: number[][]): Promise<void> {
    if (!this.collection) {
      throw new Error("ChromaDB not connected");
    }

    const ids = documents.map((d) => d.id);
    const contents = documents.map((d) => d.content);
    const metadatas = documents.map((d) => ({
      conversationId: d.conversationId,
      role: d.role,
      timestamp: d.timestamp.toISOString(),
      userName: d.metadata.userName || "",
      intent: d.metadata.intent || "",
      toolsUsed: JSON.stringify(d.metadata.toolsUsed || []),
      topics: JSON.stringify(d.metadata.topics || []),
      sentiment: d.metadata.sentiment || "neutral",
      importance: d.metadata.importance || "medium",
    }));

    await this.collection.add({
      ids,
      embeddings,
      documents: contents,
      metadatas,
    });

    // Update document count
    this.status.documentCount = await this.collection.count();
  }

  // Query by embedding (semantic search)
  async queryByEmbedding(
    embedding: number[],
    limit: number = 5,
    where?: Record<string, unknown>
  ): Promise<MemorySearchResult[]> {
    if (!this.collection) {
      throw new Error("ChromaDB not connected");
    }

    const results = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      where: where as Record<string, string | number | boolean> | undefined,
      include: ["documents", "metadatas", "distances"],
    });

    if (!results.ids[0] || results.ids[0].length === 0) {
      return [];
    }

    const searchResults: MemorySearchResult[] = [];

    for (let i = 0; i < results.ids[0].length; i++) {
      const metadata = results.metadatas?.[0]?.[i] || {};
      const distance = results.distances?.[0]?.[i] ?? 1;
      const similarity = 1 - distance; // Convert distance to similarity for cosine

      searchResults.push({
        document: {
          id: results.ids[0][i],
          conversationId: (metadata.conversationId as string) || "",
          content: results.documents?.[0]?.[i] || "",
          role: (metadata.role as "user" | "assistant") || "user",
          timestamp: new Date((metadata.timestamp as string) || Date.now()),
          metadata: {
            userName: (metadata.userName as string) || undefined,
            intent: (metadata.intent as string) || undefined,
            toolsUsed: metadata.toolsUsed
              ? JSON.parse(metadata.toolsUsed as string)
              : undefined,
            topics: metadata.topics
              ? JSON.parse(metadata.topics as string)
              : undefined,
            sentiment: metadata.sentiment as "positive" | "neutral" | "negative" | undefined,
            importance: metadata.importance as "low" | "medium" | "high" | undefined,
          },
        },
        similarity,
        distance,
      });
    }

    return searchResults;
  }

  // Delete documents by conversation ID
  async deleteByConversationId(conversationId: string): Promise<number> {
    if (!this.collection) {
      throw new Error("ChromaDB not connected");
    }

    // Get documents to delete
    const countBefore = await this.collection.count();

    await this.collection.delete({
      where: { conversationId },
    });

    const countAfter = await this.collection.count();
    this.status.documentCount = countAfter;

    return countBefore - countAfter;
  }

  // Delete documents older than retention period
  async deleteOldDocuments(retentionDays: number = 30): Promise<number> {
    if (!this.collection) {
      throw new Error("ChromaDB not connected");
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const countBefore = await this.collection.count();

    await this.collection.delete({
      where: {
        timestamp: { $lt: cutoffDate.toISOString() },
      },
    });

    const countAfter = await this.collection.count();
    this.status.documentCount = countAfter;

    return countBefore - countAfter;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.heartbeat();
      this.status.lastHealthCheck = new Date();
      this.status.error = undefined;
      return true;
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : "Unknown error";
      this.status.connected = false;
      return false;
    }
  }

  // Get all documents (for debugging/export)
  async getAllDocuments(limit: number = 1000): Promise<MemoryDocument[]> {
    if (!this.collection) {
      throw new Error("ChromaDB not connected");
    }

    const results = await this.collection.get({
      limit,
      include: ["documents", "metadatas"],
    });

    return results.ids.map((id, i) => {
      const metadata = results.metadatas?.[i] || {};
      return {
        id,
        conversationId: (metadata.conversationId as string) || "",
        content: results.documents?.[i] || "",
        role: (metadata.role as "user" | "assistant") || "user",
        timestamp: new Date((metadata.timestamp as string) || Date.now()),
        metadata: {
          userName: (metadata.userName as string) || undefined,
          intent: (metadata.intent as string) || undefined,
          toolsUsed: metadata.toolsUsed
            ? JSON.parse(metadata.toolsUsed as string)
            : undefined,
          topics: metadata.topics
            ? JSON.parse(metadata.topics as string)
            : undefined,
          sentiment: metadata.sentiment as "positive" | "neutral" | "negative" | undefined,
          importance: metadata.importance as "low" | "medium" | "high" | undefined,
        },
      };
    });
  }
}

// Singleton export
export const chromaClient = new ChromaClientWrapper();
