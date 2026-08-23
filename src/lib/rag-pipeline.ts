/**
 * RAG pipeline — server-side only.
 *
 * Implements the full Retrieval-Augmented Generation flow for a single
 * user question within a single tenant's knowledge base:
 *
 *   0. Classify intent — greetings, farewells, gratitude, affirmations, and
 *      bot-identity questions are handled instantly with a canned reply.
 *      No Embeddings API call, no LLM call, zero cost.
 *   1. Embed the user's question.
 *   2. Search the tenant-scoped vector store (never cross-tenant).
 *   3. Check whether any result clears SIMILARITY_THRESHOLD.
 *      → Below threshold: return FALLBACK_MESSAGE without calling the LLM.
 *   4. Build a system prompt that injects the retrieved context.
 *   5. Call the LLM with the system prompt + user question.
 *   6. Return the LLM's answer.
 *
 * Tenant isolation guarantee:
 *   `tenantId` is extracted from the verified JWT claim `tid` inside the
 *   chat message handler and passed here.  It is used as the mandatory
 *   scope argument to `searchVectors()` — a global search is never issued.
 *
 * NEVER import this module from client-side code.
 */

import { generateEmbedding } from '@/lib/embeddings';
import { searchVectors } from '@/lib/vector-store';
import { callLlm } from '@/lib/llm-client';
import {
  isBelowThreshold,
  FALLBACK_MESSAGE,
  buildSystemPrompt,
  SIMILARITY_THRESHOLD,
} from '@/lib/rag-config';
import { classifyIntent } from '@/lib/intent-classifier';

// ── Config ────────────────────────────────────────────────────────────────────

/** Number of chunks to retrieve per query. */
const RAG_TOP_K = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RagInput {
  /** Verified tenant ID (from JWT claim `tid`). Scopes the vector search. */
  tenantId: string;
  /** The user's question. */
  question: string;
}

export type RagOutcome =
  | { status: 'answered';  reply: string; chunksUsed: number }
  | { status: 'greeting';  reply: string }
  | { status: 'fallback';  reply: string }
  | { status: 'error';     reply: string; error: string };

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * Run the RAG pipeline for a single user question.
 *
 * This function never throws — all errors are captured into `RagOutcome`.
 * The caller only needs to read `outcome.reply` and return it to the user.
 *
 * @param input - `{ tenantId, question }` — both verified server-side.
 * @returns     A `RagOutcome` describing what happened and what to show the user.
 */
export async function runRagPipeline(input: RagInput): Promise<RagOutcome> {
  const { tenantId, question } = input;

  // ── Step 0: Intent classification ─────────────────────────────────────────
  // Pure rule-based check — no API calls, no cost.
  // Catches greetings, farewells, gratitude, affirmations, and bot-identity
  // questions before the Embeddings API or LLM are ever touched.
  const intentResult = classifyIntent(question);
  if (intentResult.intent !== 'question') {
    console.log(
      `[rag-pipeline] tenant=${tenantId} | intent=${intentResult.intent} | skipping RAG`,
    );
    return { status: 'greeting', reply: intentResult.reply! };
  }

  // ── Step 1: Embed the question ─────────────────────────────────────────────
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(question);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Embedding failed';
    console.error(`[rag-pipeline] Embedding error (tenant: ${tenantId}):`, err);
    return {
      status: 'error',
      reply:  FALLBACK_MESSAGE,
      error,
    };
  }

  // ── Step 2: Tenant-scoped vector search ────────────────────────────────────
  // searchVectors() ONLY searches within the given tenantId.
  // Cross-tenant data is never accessible here.
  //
  // Pass threshold=0 so the DB returns the best available matches regardless
  // of score. We log the raw scores first (for diagnostics), then apply
  // SIMILARITY_THRESHOLD in JS. This ensures the log line always shows what
  // the top scores actually are — even when they fall below the threshold.
  const rawResults = await searchVectors(tenantId, queryEmbedding, RAG_TOP_K, 0);

  const topScores = rawResults.map((r) => r.score.toFixed(3)).join(', ');
  console.log(
    `[rag-pipeline] tenant=${tenantId} | rawHits=${rawResults.length} | ` +
    `topScores=[${topScores || 'none'}] | threshold=${SIMILARITY_THRESHOLD}`,
  );

  // ── Step 3: Threshold check ────────────────────────────────────────────────
  const results = rawResults.filter((r) => r.score >= SIMILARITY_THRESHOLD);
  console.log(
    `[rag-pipeline] tenant=${tenantId} | hitsAboveThreshold=${results.length}`,
  );
  if (results.length === 0) {
    return { status: 'fallback', reply: FALLBACK_MESSAGE };
  }

  // ── Step 4: Build context + system prompt ──────────────────────────────────
  // Chunks are already sorted by score descending from searchVectors().
  const context = results.map((r) => r.text).join('\n\n---\n\n');
  const systemPrompt = buildSystemPrompt(context);

  // ── Step 5: Call the LLM ───────────────────────────────────────────────────
  let reply: string;
  try {
    reply = await callLlm([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: question },
    ]);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'LLM call failed';
    console.error(`[rag-pipeline] LLM error (tenant: ${tenantId}):`, err);
    return {
      status: 'error',
      reply:  FALLBACK_MESSAGE,
      error,
    };
  }

  return { status: 'answered', reply, chunksUsed: results.length };
}
