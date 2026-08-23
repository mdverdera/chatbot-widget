import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCmsAuth } from '@/lib/cms-auth';
import { generateEmbedding } from '@/lib/embeddings';
import { searchVectors } from '@/lib/vector-store';
import { SIMILARITY_THRESHOLD } from '@/lib/rag-config';
import { checkRateLimit } from '@/lib/rate-limiter';
import type { RetrieveKnowledgeRequest, RetrieveKnowledgeResponse } from '@/types/knowledge';
import type { ApiErrorResponse } from '@/types/widget';

/**
 * POST /api/knowledge/retrieve
 *
 * Retrieves the most relevant knowledge chunks for a given query, scoped
 * strictly to the authenticated tenant.  Cross-tenant retrieval is impossible:
 * the tenantId drives the vector store filter and is verified server-side.
 *
 * This endpoint is intended for internal use — called by the chat message
 * handler (Phase 4C+) when building an LLM prompt.  The CMS authenticates
 * with Bearer <CMS_API_SECRET>, but in practice the chatbot's own message
 * handler will call it with the same secret (it runs in the same process).
 *
 * Authentication:
 *   Bearer <CMS_API_SECRET> in the Authorization header.
 *
 * Request body:
 *   {
 *     tenantId: string    — the tenant to search within (must match auth)
 *     query:    string    — the user's question
 *     topK?:    number    — max results to return (default: 5, max: 20)
 *   }
 *
 * Response 200:
 *   {
 *     tenantId: string,
 *     results: [{ id, text, score, documentId, chunkIndex }]
 *   }
 *
 * Results are filtered by SIMILARITY_THRESHOLD and sorted by score descending.
 * An empty results array means no relevant knowledge was found for this tenant.
 *
 * Security:
 *   - Requires valid CMS_API_SECRET.
 *   - tenantId is validated before any vector search.
 *   - The vector store enforces per-tenant isolation independently.
 */

const DEFAULT_TOP_K = 5;
const MAX_TOP_K     = 20;

// Rate limit: 120 retrieval calls per minute (called per chat message).
const RETRIEVE_RATE_LIMIT  = 120;
const RETRIEVE_RATE_WINDOW = 60 * 1000;

type ResponseBody = RetrieveKnowledgeResponse | ApiErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const body = req.body as Partial<RetrieveKnowledgeRequest>;

  // ── CMS authentication ─────────────────────────────────────────────────────
  const auth = requireCmsAuth(req, res, body.tenantId);
  if (!auth) return;

  const { tenantId } = auth;

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const rate = checkRateLimit(`retrieve:${tenantId}`, RETRIEVE_RATE_LIMIT, RETRIEVE_RATE_WINDOW);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' });
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const { query, topK: rawTopK } = body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required', code: 'MISSING_FIELD' });
  }
  if (query.length > 2000) {
    return res.status(400).json({ error: 'query must be ≤ 2000 characters', code: 'INVALID_FIELD' });
  }

  // topK: clamp to [1, MAX_TOP_K].
  let topK = DEFAULT_TOP_K;
  if (rawTopK !== undefined) {
    const n = Number(rawTopK);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: 'topK must be a positive integer', code: 'INVALID_FIELD' });
    }
    topK = Math.min(n, MAX_TOP_K);
  }

  // ── Embed the query ────────────────────────────────────────────────────────
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Embedding generation failed';
    console.error('[knowledge/retrieve] Embedding error:', err);
    return res.status(500).json({ error: msg, code: 'SERVER_ERROR' });
  }

  // ── Tenant-scoped vector search ────────────────────────────────────────────
  // SIMILARITY_THRESHOLD is used as the minimum score filter.
  // The vector store NEVER searches across tenants.
  const results = searchVectors(tenantId, queryEmbedding, topK, SIMILARITY_THRESHOLD);

  return res.status(200).json({ tenantId, results });
}
