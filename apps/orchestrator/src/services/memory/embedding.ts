import OpenAI from "openai";
import { config } from "../../config/index.js";

// Initialize OpenAI client for embeddings
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Generate embedding for a single text
export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: config.embeddingModel,
    input: text,
  });

  return response.data[0].embedding;
}

// Generate embeddings for multiple texts
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // OpenAI supports batching up to 2048 inputs
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: config.embeddingModel,
      input: batch,
    });

    const batchEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

// Get embedding dimension for the model
export function getEmbeddingDimension(): number {
  // text-embedding-3-small: 1536 dimensions
  // text-embedding-3-large: 3072 dimensions
  return config.embeddingModel === "text-embedding-3-large" ? 3072 : 1536;
}
