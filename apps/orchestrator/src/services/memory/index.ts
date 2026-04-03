// Long-Term Memory Module for JARVIS
// Provides persistent conversation memory using ChromaDB

export { memoryService } from "./memory-service.js";
export { chromaClient } from "./chroma-client.js";
export { embed, embedBatch, getEmbeddingDimension } from "./embedding.js";
export type {
  MemoryDocument,
  MemoryMetadata,
  MemorySearchResult,
  HistoricalContext,
  ChromaStatus,
  StoreMessageOptions,
  SearchOptions,
  UserPreference,
} from "./types.js";
