import { promises as fs } from "fs";
import path from "path";
import { config } from "../../config/index.js";
import type { MemoryDocument, ChromaStatus, MemorySearchResult } from "./types.js";

// File-based memory storage (no Docker required)
// Stores memories in JSON files with embeddings for semantic search

interface StoredMemory {
  document: MemoryDocument;
  embedding: number[];
}

interface MemoryStore {
  memories: StoredMemory[];
  preferences: Record<string, { value: string; timestamp: string }>;
  lastUpdated: string;
}

class FileMemoryClient {
  private memoryDir: string;
  private memoryFile: string;
  private store: MemoryStore | null = null;
  private status: ChromaStatus = {
    connected: false,
    host: "file-system",
    port: 0,
    collection: "JARVIS_memories",
    documentCount: 0,
    lastHealthCheck: new Date(),
  };

  constructor() {
    // Store memories in user's JARVIS data folder
    this.memoryDir = path.join(process.cwd(), "data", "memory");
    this.memoryFile = path.join(this.memoryDir, "memories.json");
  }

  // Initialize - load existing memories from disk
  async connect(): Promise<boolean> {
    if (!config.chroma.enabled) {
      console.log("[FileMemory] Memory system disabled via config");
      return false;
    }

    try {
      console.log("[FileMemory] Initializing file-based memory...");
      
      // Create directory if needed
      await fs.mkdir(this.memoryDir, { recursive: true });
      
      // Load existing memories or create new store
      try {
        const data = await fs.readFile(this.memoryFile, "utf-8");
        this.store = JSON.parse(data);
        // Convert date strings back to Date objects
        this.store!.memories.forEach(m => {
          m.document.timestamp = new Date(m.document.timestamp);
        });
      } catch {
        // File doesn't exist, create new store
        this.store = {
          memories: [],
          preferences: {},
          lastUpdated: new Date().toISOString(),
        };
        await this.save();
      }

      this.status = {
        connected: true,
        host: "file-system",
        port: 0,
        collection: this.memoryFile,
        documentCount: this.store!.memories.length,
        lastHealthCheck: new Date(),
      };

      console.log(`[FileMemory] Loaded ${this.store!.memories.length} memories from disk`);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("[FileMemory] Failed to initialize:", errorMsg);
      this.status.error = errorMsg;
      return false;
    }
  }


  // Save memories to disk
  private async save(): Promise<void> {
    if (!this.store) return;
    this.store.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.memoryFile, JSON.stringify(this.store, null, 2));
  }

  isConnected(): boolean {
    return this.status.connected && this.store !== null;
  }

  getStatus(): ChromaStatus {
    return { ...this.status };
  }

  // Add documents with embeddings
  async addDocuments(documents: MemoryDocument[], embeddings: number[][]): Promise<void> {
    if (!this.store) throw new Error("Memory not initialized");

    for (let i = 0; i < documents.length; i++) {
      this.store.memories.push({
        document: documents[i],
        embedding: embeddings[i],
      });
    }

    this.status.documentCount = this.store.memories.length;
    await this.save();
  }

  // Cosine similarity between two vectors
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }


  // Semantic search using embeddings
  async queryByEmbedding(
    embedding: number[],
    limit: number = 5,
    where?: Record<string, unknown>
  ): Promise<MemorySearchResult[]> {
    if (!this.store) throw new Error("Memory not initialized");

    // Calculate similarity for all memories
    let results = this.store.memories.map(m => ({
      document: m.document,
      similarity: this.cosineSimilarity(embedding, m.embedding),
      distance: 1 - this.cosineSimilarity(embedding, m.embedding),
    }));

    // Apply filters
    if (where) {
      if (where.role) {
        results = results.filter(r => r.document.role === where.role);
      }
      if (where.conversationId) {
        results = results.filter(r => r.document.conversationId === where.conversationId);
      }
    }

    // Sort by similarity (highest first) and limit
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // Delete by conversation ID
  async deleteByConversationId(conversationId: string): Promise<number> {
    if (!this.store) throw new Error("Memory not initialized");
    
    const before = this.store.memories.length;
    this.store.memories = this.store.memories.filter(
      m => m.document.conversationId !== conversationId
    );
    const deleted = before - this.store.memories.length;
    
    this.status.documentCount = this.store.memories.length;
    await this.save();
    return deleted;
  }


  // Delete old documents
  async deleteOldDocuments(retentionDays: number = 30): Promise<number> {
    if (!this.store) throw new Error("Memory not initialized");
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    
    const before = this.store.memories.length;
    this.store.memories = this.store.memories.filter(
      m => m.document.timestamp >= cutoff
    );
    const deleted = before - this.store.memories.length;
    
    if (deleted > 0) {
      this.status.documentCount = this.store.memories.length;
      await this.save();
    }
    return deleted;
  }

  async healthCheck(): Promise<boolean> {
    this.status.lastHealthCheck = new Date();
    return this.isConnected();
  }

  async getAllDocuments(limit: number = 1000): Promise<MemoryDocument[]> {
    if (!this.store) throw new Error("Memory not initialized");
    return this.store.memories.slice(0, limit).map(m => m.document);
  }

  // Store user preference
  async storePreference(key: string, value: string): Promise<void> {
    if (!this.store) throw new Error("Memory not initialized");
    this.store.preferences[key] = {
      value,
      timestamp: new Date().toISOString(),
    };
    await this.save();
  }

  // Get user preference
  getPreference(key: string): string | undefined {
    return this.store?.preferences[key]?.value;
  }

  // Get all preferences
  getAllPreferences(): Record<string, string> {
    if (!this.store) return {};
    const result: Record<string, string> = {};
    for (const [key, data] of Object.entries(this.store.preferences)) {
      result[key] = data.value;
    }
    return result;
  }
}

// Export singleton
export const fileMemoryClient = new FileMemoryClient();
