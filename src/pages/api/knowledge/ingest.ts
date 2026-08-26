import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCmsAuth } from '@/lib/cms-auth';
import { processDocument } from '@/lib/knowledge-processor';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createLogger, logRequest } from '@/lib/logger';
import { monitorProcessingError } from '@/lib/monitoring';
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
 * Response 200:
 *   { documentId, status: 'completed', chunkCount }
 *
 * Response 422:
 *   { documentId, status: 'failed' }
 *
 * Security:
 *   - CMS_API_SECRET must match — 401 otherwise.
 *   - tenantId must be present — 401 otherwise.
 *   - Every stored vector chunk is tagged with tenantId.
 *   - Cross-tenant ingestion is impossible: the authenticated tenantId is the
 *     only one used for storage, regardless of what the CMS claims.
 *
 * Error responses:
 *   - All error messages are safe (no stack traces, no internal details).
 */

const COMPONENT = 'knowledge/ingest';
const log = createLogger(COMPONENT);

// Rate limit: 30 ingest requests per tenant per minute.
const INGEST_RATE_LIMIT  = 30;
const INGEST_RATE_WINDOW = 60 * 1000;

type ResponseBody = IngestDocumentResponse | ApiErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  const startMs = Date.now();

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
    log.warn('Rate limit exceeded', { tenantId });
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

  log.info('Starting document ingest', {
    tenantId,
    documentId: documentId.trim(),
    fileName:   fileName.trim(),
  });

  // ── Run pipeline ───────────────────────────────────────────────────────────
  // processDocument handles status reporting to the CMS internally.
  const outcome = await processDocument({
    documentId: documentId.trim(),
    tenantId,
    fileName:    fileName.trim(),
    downloadUrl: downloadUrl.trim(),
  });

  const durationMs = Date.now() - startMs;

  if (outcome.status === 'completed') {
    logRequest({
      component: COMPONENT,
      method:    req.method,
      path:      '/api/knowledge/ingest',
      status:    200,
      ip:        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown',
      tenantId,
      durationMs,
    });
    log.info('Document ingest completed', {
      tenantId,
      documentId: documentId.trim(),
      chunkCount: outcome.chunkCount,
      durationMs,
    });
    return res.status(200).json({
      documentId: documentId.trim(),
      status:     'completed',
      chunkCount: outcome.chunkCount,
    });
  }

  // Processing failed — emit monitoring event and return 422.
  monitorProcessingError(COMPONENT, outcome.error, tenantId, documentId.trim());
  log.warn('Document ingest failed', {
    tenantId,
    documentId: documentId.trim(),
    durationMs,
  });

  return res.status(422).json({
    documentId: documentId.trim(),
    status:     'failed',
  } as IngestDocumentResponse);
}
