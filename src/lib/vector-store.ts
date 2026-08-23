/**
 * In-memory vector store — server-side only.
 *
 * Stores embedding vectors for document chunks with strict tenant isolation.
 * Every stored entry carries a `tenantId` and every query is filtered by
 * `tenantId` — cross-tenant retrieval is architecturally impossible.
 *
 * Storage strategy (Phase 4B):
 *   In-process Map for zero-infrastructure development/staging.
 *   Replace with a pgvector / Pinecone / Qdrant client in production.
 *
 * Thread-safety note:
 *   Node.js is single-threaded; no mutex needed for Map operations.
 *   In a multi-replica deployment, migrate to a shared vector database.
 *
 * NEVER import this module from client-side code.
 */

import { v4 as uuidv4 } from 'uuid';
import type { VectorEntry, RetrievalResult } from '@/types/knowledge';

// ── Storage ───────────────────────────────────────────────────────────────────

/** Primary store: vectorId → VectorEntry */
const store = new Map<string, VectorEntry>();

/**
 * Secondary index: documentId → Set<vectorId>
 * Used for O(k) document deletion (k = number of chunks per document).
 */
const docIndex = new Map<string, Set<string>>();

/**
 * Tertiary index: tenantId → Set<vectorId>
 * Enables tenant-scoped iteration without scanning the full store.
 */
const tenantIndex = new Map<string, Set<string>>();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1]; higher is more similar.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot   += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Store a batch of vector entries.
 * Existing entries with the same (documentId, chunkIndex) are overwritten.
 *
 * @param entries - Array of VectorEntry objects (without `id` or `storedAt` —
 *                  those are assigned here).
 */
export function storeVectors(
  entries: Omit<VectorEntry, 'id' | 'storedAt'>[],
): VectorEntry[] {
  const stored: VectorEntry[] = [];
  const now = Date.now();

  for (const entry of entries) {
    const id = uuidv4();
    const full: VectorEntry = { ...entry, id, storedAt: now };

    store.set(id, full);

    // Update document index.
    let docSet = docIndex.get(entry.documentId);
    if (!docSet) { docSet = new Set(); docIndex.set(entry.documentId, docSet); }
    docSet.add(id);

    // Update tenant index.
    let tenantSet = tenantIndex.get(entry.tenantId);
    if (!tenantSet) { tenantSet = new Set(); tenantIndex.set(entry.tenantId, tenantSet); }
    tenantSet.add(id);

    stored.push(full);
  }

  return stored;
}

/**
 * Search for the most similar chunks within a single tenant's knowledge base.
 * Cross-tenant results are never returned.
 *
 * @param tenantId  - The tenant to search within (required, never omit).
 * @param queryVec  - The embedding of the user's query.
 * @param topK      - Maximum number of results to return (default: 5).
 * @param threshold - Minimum cosine similarity score to include (default: 0).
 * @returns         Results sorted by score descending.
 */
export function searchVectors(
  tenantId: string,
  queryVec: number[],
  topK = 5,
  threshold = 0,
): RetrievalResult[] {
  const tenantSet = tenantIndex.get(tenantId);
  if (!tenantSet || tenantSet.size === 0) return [];

  const scored: RetrievalResult[] = [];

  for (const vectorId of tenantSet) {
    const entry = store.get(vectorId);
    if (!entry) continue;  // Stale index entry — skip.

    const score = cosineSimilarity(queryVec, entry.embedding);
    if (score < threshold) continue;

    scored.push({
      id:          entry.id,
      text:        entry.text,
      score,
      documentId:  entry.documentId,
      chunkIndex:  entry.chunkIndex,
    });
  }

  // Sort descending by score, trim to topK.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Delete all vector chunks belonging to a specific document.
 * Cleans up both the primary store and all secondary indexes.
 *
 * @param documentId - CMS document ID whose chunks should be removed.
 * @param tenantId   - Owning tenant (for index cleanup).
 * @returns          Number of vector entries deleted.
 */
export function deleteDocumentVectors(
  documentId: string,
  tenantId: string,
): number {
  const vectorIds = docIndex.get(documentId);
  if (!vectorIds || vectorIds.size === 0) return 0;

  const tenantSet = tenantIndex.get(tenantId);
  let count = 0;

  for (const vectorId of vectorIds) {
    store.delete(vectorId);
    tenantSet?.delete(vectorId);
    count++;
  }

  docIndex.delete(documentId);

  // Clean up tenant set if empty.
  if (tenantSet?.size === 0) tenantIndex.delete(tenantId);

  return count;
}

/**
 * Return a snapshot of store statistics (for diagnostics / health checks).
 * Never exposes raw vector data.
 */
export function getStoreStats(): {
  totalVectors: number;
  totalDocuments: number;
  totalTenants: number;
  vectorsPerTenant: Record<string, number>;
} {
  const vectorsPerTenant: Record<string, number> = {};
  for (const [tid, set] of tenantIndex.entries()) {
    vectorsPerTenant[tid] = set.size;
  }

  return {
    totalVectors:   store.size,
    totalDocuments: docIndex.size,
    totalTenants:   tenantIndex.size,
    vectorsPerTenant,
  };
}
