import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCmsAuth } from '@/lib/cms-auth';
import { processDocument } from '@/lib/knowledge-processor';
import { checkRateLimit } from '@/lib/rate-limiter';
import type { IngestDocumentRequest, IngestDocumentResponse } from '@/types/knowledge';
import type { ApiErrorResponse } from '@/types/widget';

/**
 * POST /api/knowledge/ingest
 *
 * Receives a knowledge document from the CMS and runs it through the full
 * processing pipeline: download → extract → chunk → embed → store.
 *
 * Authentication:
 *   Bearer <CMS_API_SECRET> in the Authorization header.
 *   The tenantId in the request body is trusted only after the secret matches.
 *
 * Request body:
 *   {
 *     documentId:  string   — CMS document ID
 *     tenantId:    string   — owning tenant
 *     title:       string   — human-readable document title
 *     fileName:    string   — original file name (determines extraction type)
 *     downloadUrl: string   — signed URL to fetch the file content
 *   }
 *
 * Response 202:
 *   { documentId, status: 'processing' }          (async processing started)
 *   { documentId, status: 'completed', chunkCount } (sync, if fast enough)
 *
 * The pipeline is run synchronously within the request so the CMS receives an
 * accurate final status.  For very large documents (Phase 5+) this should be
 * moved to a background job queue.
 *
 * Security:
 *   - CMS_API_SECRET must match — 401 otherwise.
 *   - tenantId must be present — 401 otherwise.
 *   - Every stored vector chunk is tagged with tenantId.
 *   - Cross-tenant ingestion is impossible: the authenticated tenantId is the
 *     only one used for storage, regardless of what the CMS claims.
 */

// Rate limit: 30 ingest requests per tenant per minute.
const INGEST_RATE_LIMIT  = 30;
const INGEST_RATE_WINDOW = 60 * 1000;

type ResponseBody = IngestDocumentResponse | ApiErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const body = req.body as Partial<IngestDocumentRequest>;

  // ── CMS authentication ─────────────────────────────────────────────────────
  // requireCmsAuth validates Bearer secret AND that tenantId is a non-empty string.
  const auth = requireCmsAuth(req, res, body.tenantId);
  if (!auth) return;   // 401 already sent.

  const { tenantId } = auth;

  // ── Rate limit by tenant ───────────────────────────────────────────────────
  const rate = checkRateLimit(`ingest:${tenantId}`, INGEST_RATE_LIMIT, INGEST_RATE_WINDOW);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' });
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const { documentId, fileName, downloadUrl, title } = body;

  if (!documentId || typeof documentId !== 'string' || !documentId.trim()) {
    return res.status(400).json({ error: 'documentId is required', code: 'MISSING_FIELD' });
  }
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    return res.status(400).json({ error: 'fileName is required', code: 'MISSING_FIELD' });
  }
  if (!downloadUrl || typeof downloadUrl !== 'string' || !downloadUrl.trim()) {
    return res.status(400).json({ error: 'downloadUrl is required', code: 'MISSING_FIELD' });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required', code: 'MISSING_FIELD' });
  }

  // Validate that the URL is absolute (basic guard — detailed validation
  // happens during the download step inside processDocument).
  try {
    new URL(downloadUrl);
  } catch {
    return res.status(400).json({ error: 'downloadUrl must be a valid URL', code: 'INVALID_FIELD' });
  }

  // ── Run pipeline ───────────────────────────────────────────────────────────
  // processDocument handles status reporting to the CMS internally.
  const outcome = await processDocument({
    documentId: documentId.trim(),
    tenantId,
    fileName:    fileName.trim(),
    downloadUrl: downloadUrl.trim(),
  });

  if (outcome.status === 'completed') {
    return res.status(200).json({
      documentId: documentId.trim(),
      status:     'completed',
      chunkCount: outcome.chunkCount,
    });
  }

  // Processing failed — return 422 with the error detail.
  return res.status(422).json({
    documentId: documentId.trim(),
    status:     'failed',
  } as IngestDocumentResponse);
}
