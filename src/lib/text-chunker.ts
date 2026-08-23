/**
 * Text chunker — server-side only.
 *
 * Splits a document's plain text into overlapping chunks suitable for
 * embedding.  The strategy is paragraph-aware: it first splits on double
 * newlines (paragraph boundaries), then merges short paragraphs and splits
 * long ones to hit a target chunk size.
 *
 * Tuneable via environment variables:
 *   CHUNK_SIZE        Target characters per chunk (default: 1200).
 *   CHUNK_OVERLAP     Characters of overlap between adjacent chunks (default: 200).
 *
 * Why character-based rather than token-based?
 *   Token counts require a tokeniser library (tiktoken) which adds significant
 *   bundle size.  Characters / 4 is a good-enough approximation for English
 *   text with OpenAI models.  Switch to tiktoken in Phase 5 if precision matters.
 *
 * NEVER import this module from client-side code.
 */

import type { TextChunk } from '@/types/knowledge';

// ── Config ────────────────────────────────────────────────────────────────────

function parseEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    throw new Error(`${key} must be a positive integer (got "${raw}").`);
  }
  return n;
}

/** Target size in characters for each chunk. */
export const CHUNK_SIZE: number = parseEnvInt('CHUNK_SIZE', 1200);

/** Overlap between adjacent chunks in characters. */
export const CHUNK_OVERLAP: number = parseEnvInt('CHUNK_OVERLAP', 200);

// ── Core splitting logic ──────────────────────────────────────────────────────

/**
 * Split a long string into chunks of at most `maxSize` characters, stepping
 * forward by `(maxSize - overlap)` characters each time.
 */
function splitByCharacters(
  text: string,
  maxSize: number,
  overlap: number,
): string[] {
  const step = maxSize - overlap;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start += step;
  }

  return chunks.filter((c) => c.length > 0);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Split document text into overlapping chunks ready for embedding.
 *
 * Algorithm:
 *   1. Split on double-newline (paragraph boundaries).
 *   2. Walk paragraphs, accumulating into a working buffer.
 *   3. When the buffer exceeds CHUNK_SIZE, flush it:
 *      a. If it is still within CHUNK_SIZE, emit as-is.
 *      b. Otherwise, split the buffer character-by-character with overlap.
 *   4. Carry the last CHUNK_OVERLAP characters of the previous chunk into the
 *      next one to preserve context across boundaries.
 *
 * @param text - Normalised plain text (use extractText() first).
 * @returns    Array of TextChunk objects, in document order.
 */
export function chunkText(text: string): TextChunk[] {
  if (!text.trim()) return [];

  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const rawChunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    // If this single paragraph already exceeds CHUNK_SIZE, handle separately.
    if (para.length > CHUNK_SIZE) {
      // Flush existing buffer first.
      if (buffer.trim()) {
        rawChunks.push(...splitByCharacters(buffer.trim(), CHUNK_SIZE, CHUNK_OVERLAP));
        buffer = '';
      }
      rawChunks.push(...splitByCharacters(para, CHUNK_SIZE, CHUNK_OVERLAP));
      continue;
    }

    const separator = buffer.length > 0 ? '\n\n' : '';
    const tentative = buffer + separator + para;

    if (tentative.length <= CHUNK_SIZE) {
      buffer = tentative;
    } else {
      // Flush the current buffer and start a new one with overlap.
      if (buffer.trim()) {
        rawChunks.push(buffer.trim());
        // Carry trailing characters as overlap context.
        const overlapText = buffer.slice(-CHUNK_OVERLAP).trim();
        buffer = overlapText ? overlapText + '\n\n' + para : para;
      } else {
        buffer = para;
      }
    }
  }

  // Flush remaining buffer.
  if (buffer.trim()) {
    rawChunks.push(...splitByCharacters(buffer.trim(), CHUNK_SIZE, CHUNK_OVERLAP));
  }

  return rawChunks
    .filter((c) => c.length > 0)
    .map((text, index) => ({
      index,
      text,
      tokenEstimate: Math.ceil(text.length / 4),
    }));
}
