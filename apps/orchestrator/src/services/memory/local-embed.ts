// Local embeddings only. OpenAI 1536-dim vectors stay in sqlite-store.ts
// and are never produced or stored here.

export const LOCAL_EMBED_MODEL = "nomic-embed-text";

export interface LocalEmbedding {
  model: string;
  dim: number;
  vectors: number[][];
}

export type LocalEmbedder = (texts: string[]) => Promise<LocalEmbedding>;

export function assertLocalVector(model: string, dim: number): void {
  if (!Number.isInteger(dim) || dim < 8 || dim > 4096) {
    throw new Error(`Refusing embedding dimension ${dim}.`);
  }
  if (dim === 1536 || /text-embedding|openai|\bada\b/i.test(model)) {
    throw new Error(
      "Refusing OpenAI 1536-dim vectors. This index embeds with local Ollama nomic-embed-text only."
    );
  }
}

export function ollamaEmbedder(env: NodeJS.ProcessEnv = process.env): LocalEmbedder {
  const base = (env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const requested = (env.OLLAMA_EMBED_MODEL || LOCAL_EMBED_MODEL).replace(/^ollama\//, "");
  return async (texts: string[]) => {
    if (texts.length === 0) return { model: requested, dim: 0, vectors: [] };
    assertLocalVector(requested, 768);
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const input = texts.slice(i, i + 16);
      const response = await fetch(`${base}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: requested,
          input,
          options: { num_gpu: 0 },
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama embeddings failed (${response.status}). Is nomic-embed-text pulled?`);
      }
      const body = (await response.json()) as { embeddings?: number[][] };
      const batch = body.embeddings || [];
      if (batch.length !== input.length) {
        throw new Error("Ollama returned the wrong number of embeddings.");
      }
      for (const vector of batch) {
        assertLocalVector(requested, vector.length);
        vectors.push(vector);
      }
    }
    return { model: requested, dim: vectors[0]?.length || 0, vectors };
  };
}
