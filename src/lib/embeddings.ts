/**
 * Embeddings service — server-side only.
 *
 * Generates dense vector embeddings for text chunks using the OpenAI
 * Embeddings API (text-embedding-3-small by default).
 *
 * Configuration (environment variables):
 *   OPENAI_API_KEY        (required) Your OpenAI API key.
 *   EMBEDDING_MODEL       (optional) Model to use. Default: text-embedding-3-small.
 *   EMBEDDING_BATCH_SIZE  (optional) Max texts per API call. Default: 100.
 *
 * Batching:
 *   The OpenAI embeddings endpoint accepts up to 2048 inputs per request.
 *   We default to 100 for safety and to limit per-request latency.
 *   Large documents are split into batches automatically.
 *
 * NEVER import this module from client-side code.
 */

import OpenAI from 'openai';

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_BATCH_SIZE = 100;

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. Set it in .env.local.',
    );
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

function getEmbeddingModel(): string {
  return (process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL).trim();
}

function getEmbeddingBatchSize(): number {
  const raw = process.env.EMBEDDING_BATCH_SIZE;
  if (!raw) return DEFAULT_BATCH_SIZE;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    throw new Error(`EMBEDDING_BATCH_SIZE must be a positive integer (got "${raw}").`);
  }
  return n;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate embeddings for an array of text strings.
 * Batches the requests automatically if the input exceeds EMBEDDING_BATCH_SIZE.
 *
 * @param texts - Array of strings to embed.
 * @returns     Array of embedding vectors in the same order as `texts`.
 * @throws      If OPENAI_API_KEY is not set, or if the API returns an error.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client    = getOpenAiClient();
  const model     = getEmbeddingModel();
  const batchSize = getEmbeddingBatchSize();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await client.embeddings.create({
      model,
      input: batch,
      encoding_format: 'float',
    });

    // The API guarantees results are returned in the same order as the input.
    for (const item of response.data) {
      results.push(item.embedding);
    }
  }

  return results;
}

/**
 * Generate an embedding for a single text string.
 * Convenience wrapper around generateEmbeddings for query embeddings.
 *
 * @param text - The text to embed.
 * @returns    A single embedding vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  if (!embedding) {
    throw new Error('Failed to generate embedding: API returned empty result.');
  }
  return embedding;
}
