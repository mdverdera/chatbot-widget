/**
 * RAG pipeline configuration — server-side only.
 *
 * Centralises the two tuneable knobs for out-of-scope handling:
 *
 *   SIMILARITY_THRESHOLD  (env, default 0.75)
 *     Minimum cosine-similarity score a vector-search hit must reach before
 *     its document chunk is injected into the LLM prompt as context.
 *     If the best match scores below this value the LLM is skipped entirely
 *     and FALLBACK_MESSAGE is returned directly to the user.
 *
 *   FALLBACK_MESSAGE  (env)
 *     The reply returned when no document chunk clears the threshold.
 *     Defaults to the standard out-of-scope message below.
 *
 * Usage in the RAG pipeline:
 *
 *   import { isBelowThreshold, FALLBACK_MESSAGE, buildSystemPrompt } from '@/lib/rag-config';
 *
 *   const hits = await vectorSearch(query);
 *   if (isBelowThreshold(hits[0]?.score)) {
 *     return FALLBACK_MESSAGE;           // skip LLM call
 *   }
 *   const systemPrompt = buildSystemPrompt(hits.map(h => h.text).join('\n\n'));
 *   const reply = await callLlm(systemPrompt, userMessage);
 *
 * NEVER import this module from client-side code.
 */

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_SIMILARITY_THRESHOLD = 0.75;

const DEFAULT_FALLBACK_MESSAGE =
  "I'm sorry, I don't have information on that topic. Please contact us directly for further assistance.";

// ── Env-backed values (read once at module load) ──────────────────────────────

function parseSimilarityThreshold(): number {
  const raw = process.env.SIMILARITY_THRESHOLD;
  if (!raw) return DEFAULT_SIMILARITY_THRESHOLD;
  const parsed = parseFloat(raw);
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(
      `SIMILARITY_THRESHOLD must be a number between 0 and 1 (got "${raw}").`,
    );
  }
  return parsed;
}

/**
 * Minimum cosine-similarity score required to use a document chunk as context.
 * Scores are expected in the range [0, 1].
 */
export const SIMILARITY_THRESHOLD: number = parseSimilarityThreshold();

/**
 * Reply sent to the user when no document chunk clears SIMILARITY_THRESHOLD,
 * or when the vector store returns no results at all.
 */
export const FALLBACK_MESSAGE: string =
  process.env.FALLBACK_MESSAGE?.trim() || DEFAULT_FALLBACK_MESSAGE;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns `true` when the best similarity score from a vector search is too
 * low to be useful — i.e. the LLM should be skipped and FALLBACK_MESSAGE
 * returned directly.
 *
 * @param bestScore - Highest cosine-similarity score from the vector search,
 *                    or `undefined` / `null` when the store returned no hits.
 */
export function isBelowThreshold(bestScore: number | undefined | null): boolean {
  if (bestScore == null) return true;
  return bestScore < SIMILARITY_THRESHOLD;
}

/**
 * Build the system prompt that instructs the LLM to answer strictly from the
 * provided context and to fall back gracefully when it cannot.
 *
 * @param context - Concatenated text of the retrieved document chunks.
 */
export function buildSystemPrompt(context: string): string {
  return `You are a helpful assistant. Answer the user's question using ONLY the information provided in the context below.
If the context does not contain enough information to answer the question, respond with exactly:
"${FALLBACK_MESSAGE}"
Do not make up information. Do not answer from general knowledge.

CONTEXT:
${context}`;
}
