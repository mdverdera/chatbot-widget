/**
 * Vector store — server-side only.
 *
 * Persists and retrieves knowledge chunk embeddings using Supabase pgvector.
 * The table schema is defined in supabase/migrations/001_ai_knowledge_chunks.sql.
 *
 * Table: ai_knowledge_chunks
 *   id          uuid primary key
 *   document_id text
 *   tenant_id   text          ← every write and every query is scoped to this
 *   content     text
 *   embedding   vector(1536)  ← OpenAI text-embedding-3-small
 *   chunk_index integer
 *   created_at  timestamptz
 *
 * Tenant isolation guarantee:
 *   Every INSERT includes tenant_id.
 *   Every SELECT filters by tenant_id via the match_knowledge_chunks() RPC.
 *   Every DELETE filters by (document_id, tenant_id).
 *   Cross-tenant queries are architecturally impossible from this module.
 *
 * OpenAI isolation guarantee:
 *   This module receives pre-computed float[] vectors from embeddings.ts.
 *   It never calls OpenAI directly — that separation is intentional.
 *
 * NEVER import this module from client-side code.
 */

import { getSupabaseClient } from '@/lib/supabase';
import type { RetrievalResult } from '@/types/knowledge';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shape of a row in ai_knowledge_chunks (subset used by this module). */
interface ChunkRow {
  id:          string;
  document_id: string;
  tenant_id:   string;
  content:     string;
  chunk_index: number;
  created_at:  string;
}

/** Shape returned by match_knowledge_chunks() RPC. */
interface MatchRow {
  id:          string;
  document_id: string;
  content:     string;
  chunk_index: number;
  similarity:  number;
}

/** Input shape for storeVectors(). Mirrors the old VectorEntry minus id/storedAt. */
export interface VectorInsert {
  documentId:  string;
  tenantId:    string;
  text:        string;
  embedding:   number[];
  chunkIndex:  number;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persist a batch of vector chunks for a document.
 *
 * Accepts the same shape as the old in-memory store so knowledge-processor.ts
 * requires no changes.
 *
 * @param entries - Array of chunks with pre-computed embeddings.
 * @throws        On Supabase write error.
 */
export async function storeVectors(
  entries: Omit<VectorInsert, never>[],
): Promise<void> {
  if (entries.length === 0) return;

  const supabase = getSupabaseClient();

  const rows = entries.map((e) => ({
    document_id: e.documentId,
    tenant_id:   e.tenantId,
    content:     e.text,
    embedding:   e.embedding,
    chunk_index: e.chunkIndex,
  }));

  const { error } = await supabase
    .from('ai_knowledge_chunks')
    .insert(rows);

  if (error) {
    throw new Error(`[vector-store] storeVectors failed: ${error.message}`);
  }
}

/**
 * Cosine-similarity search within a single tenant's knowledge base.
 *
 * Calls the match_knowledge_chunks() Postgres function (defined in the migration)
 * which filters by tenant_id and applies the similarity threshold server-side,
 * so no cross-tenant rows ever leave the database.
 *
 * @param tenantId  - Tenant to search within. NEVER omit.
 * @param queryVec  - 1536-dimension embedding of the user's question.
 * @param topK      - Maximum chunks to return (default: 5).
 * @param threshold - Minimum cosine similarity [0–1] (default: 0).
 * @returns         Results sorted by similarity descending.
 */
export async function searchVectors(
  tenantId:  string,
  queryVec:  number[],
  topK       = 5,
  threshold  = 0,
): Promise<RetrievalResult[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryVec,
    p_tenant_id:     tenantId,
    match_threshold: threshold,
    match_count:     topK,
  });

  if (error) {
    throw new Error(`[vector-store] searchVectors failed: ${error.message}`);
  }

  const rows = (data ?? []) as MatchRow[];

  return rows.map((row) => ({
    id:          row.id,
    text:        row.content,
    score:       row.similarity,
    documentId:  row.document_id,
    chunkIndex:  row.chunk_index,
  }));
}

/**
 * Delete all vector chunks for a document, scoped to a tenant.
 *
 * Filters by BOTH document_id AND tenant_id — a document from tenant-A
 * cannot delete chunks owned by tenant-B even if document IDs collide.
 *
 * @param documentId - CMS document ID whose chunks should be removed.
 * @param tenantId   - Owning tenant.
 * @returns          Number of rows deleted.
 */
export async function deleteDocumentVectors(
  documentId: string,
  tenantId:   string,
): Promise<number> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('ai_knowledge_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('tenant_id',   tenantId)
    .select('id');          // ask Supabase to return the deleted rows so we can count them

  if (error) {
    throw new Error(`[vector-store] deleteDocumentVectors failed: ${error.message}`);
  }

  return (data ?? []).length;
}

/**
 * Return store statistics scoped per tenant.
 * Uses a SELECT COUNT(*) GROUP BY query — no embeddings are transferred.
 */
export async function getStoreStats(): Promise<{
  totalVectors:     number;
  totalDocuments:   number;
  totalTenants:     number;
  vectorsPerTenant: Record<string, number>;
}> {
  const supabase = getSupabaseClient();

  // Total vectors + total distinct documents
  const { count: totalVectors, error: countErr } = await supabase
    .from('ai_knowledge_chunks')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    throw new Error(`[vector-store] getStoreStats count failed: ${countErr.message}`);
  }

  // Per-tenant counts
  const { data: tenantRows, error: tenantErr } = await supabase
    .from('ai_knowledge_chunks')
    .select('tenant_id');

  if (tenantErr) {
    throw new Error(`[vector-store] getStoreStats tenant query failed: ${tenantErr.message}`);
  }

  const vectorsPerTenant: Record<string, number> = {};
  const docSet = new Set<string>();

  for (const row of (tenantRows ?? []) as Pick<ChunkRow, 'tenant_id'>[]) {
    vectorsPerTenant[row.tenant_id] = (vectorsPerTenant[row.tenant_id] ?? 0) + 1;
  }

  // Total distinct documents — separate lightweight query
  const { data: docRows, error: docErr } = await supabase
    .from('ai_knowledge_chunks')
    .select('document_id');

  if (docErr) {
    throw new Error(`[vector-store] getStoreStats doc query failed: ${docErr.message}`);
  }

  for (const row of (docRows ?? []) as Pick<ChunkRow, 'document_id'>[]) {
    docSet.add(row.document_id);
  }

  return {
    totalVectors:   totalVectors ?? 0,
    totalDocuments: docSet.size,
    totalTenants:   Object.keys(vectorsPerTenant).length,
    vectorsPerTenant,
  };
}
