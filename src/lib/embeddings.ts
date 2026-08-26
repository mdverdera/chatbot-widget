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
 * Phase 5B additions:
 *   - Records per-batch usage metrics (latency, token counts) via llm-usage.ts.
 *
 * NEVER import this module from client-side code.
 */

import OpenAI from 'openai';
import { recordUsage } from '@/lib/llm-usage';
import { createLogger } from '@/lib/logger';

const log = createLogger('embeddings');

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
 * Records per-batch usage metrics automatically.
 *
 * @param texts    - Array of strings to embed.
 * @param tenantId - Tenant context for usage tracking (pass when available).
 * @returns        Array of embedding vectors in the same order as `texts`.
 * @throws         If OPENAI_API_KEY is not set, or if the API returns an error.
 */
export async function generateEmbeddings(
  texts:    string[],
  tenantId = 'unknown',
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client    = getOpenAiClient();
  const model     = getEmbeddingModel();
  const batchSize = getEmbeddingBatchSize();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch   = texts.slice(i, i + batchSize);
    const startMs = Date.now();

    try {
      const response = await client.embeddings.create({
        model,
        input: batch,
        encoding_format: 'float',
      });

      const latencyMs = Date.now() - startMs;

      recordUsage({
        category:  'embedding',
        tenantId,
        model,
        success:   true,
        latencyMs,
        tokens: response.usage
          ? {
              prompt:     response.usage.prompt_tokens,
              completion: 0,
              total:      response.usage.total_tokens,
            }
          : undefined,
      });

      log.debug('Embedding batch succeeded', {
        batchSize: batch.length,
        latencyMs,
        totalTokens: response.usage?.total_tokens,
        tenantId,
      });

      // The API guarantees results are returned in the same order as the input.
      for (const item of response.data) {
        results.push(item.embedding);
      }
    } catch (err) {
      const latencyMs    = Date.now() - startMs;
      const errorMessage = err instanceof Error ? err.message : 'Embedding batch failed';

      recordUsage({
        category:     'embedding',
        tenantId,
        model,
        success:      false,
        latencyMs,
        errorMessage,
      });

      log.error('Embedding batch failed', { batchSize: batch.length, latencyMs, tenantId }, err);
      throw err;
    }
  }

  return results;
}

/**
 * Generate an embedding for a single text string.
 * Convenience wrapper around generateEmbeddings for query embeddings.
 *
 * @param text     - The text to embed.
 * @param tenantId - Tenant context for usage tracking (pass when available).
 * @returns        A single embedding vector.
 */
export async function generateEmbedding(
  text:    string,
  tenantId = 'unknown',
): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text], tenantId);
  if (!embedding) {
    throw new Error('Failed to generate embedding: API returned empty result.');
  }
  return embedding;
}
