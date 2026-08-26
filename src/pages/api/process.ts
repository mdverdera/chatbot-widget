import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCmsSecretOnly } from '@/lib/cms-auth';
import { dispatchById } from '@/lib/processing-queue';
import { ensureSchedulerRunning } from '@/lib/poll-scheduler';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createLogger, logRequest } from '@/lib/logger';
import type { ApiErrorResponse } from '@/types/widget';

/**
 * POST /api/process
 *
 * Push notification endpoint.  The CMS calls this immediately after saving a
 * knowledge document, so the chatbot can begin processing without waiting for
 * the next poll cycle.
 *
 * Contract:
 *   - Responds in < 1 second with { accepted: true }.
 *   - All heavy work (download, extract, chunk, embed, store) runs in a
 *     detached background promise — the HTTP response is never delayed by it.
 *   - Duplicate pushes for the same document_id while it is already being
 *     processed are silently accepted (idempotent).
 *
 * Authentication:
 *   Bearer <CHATBOT_API_SECRET> in the Authorization header.
 *   (Same secret the CMS has configured as its outbound token.)
 *
 * Request body:
 *   {
 *     document_id: string   — CMS document ID to process
 *     tenant_id:   string   — owning tenant (used for vector scoping)
 *   }
 *
 * Response 200:
 *   { accepted: true }
 *
 * Error responses:
 *   - All error messages are safe (no stack traces, no internal details).
 */

const COMPONENT = 'process';
const log = createLogger(COMPONENT);

interface ProcessPushBody {
  document_id?: unknown;
  tenant_id?:   unknown;
}

interface AcceptedResponse {
  accepted: true;
}

// Rate limit: 120 push notifications per minute across all tenants.
// This is generous — real upload rates are far lower.
const PROCESS_RATE_LIMIT  = 120;
const PROCESS_RATE_WINDOW = 60 * 1000;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<AcceptedResponse | ApiErrorResponse>,
) {
  const startMs = Date.now();

  // ── Method guard ──────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  // ── Authentication — validate CHATBOT_API_SECRET ──────────────────────────
  // requireCmsSecretOnly validates Bearer only (no tenantId required at header level).
  if (!requireCmsSecretOnly(req, res)) return;  // 401 already sent.

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown';

  const rate = checkRateLimit(`process:${ip}`, PROCESS_RATE_LIMIT, PROCESS_RATE_WINDOW);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    log.warn('Rate limit exceeded', { ip });
    return res.status(429).json({ error: 'Too many requests.', code: 'RATE_LIMITED' });
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const body = req.body as ProcessPushBody;

  const documentId =
    typeof body.document_id === 'string' ? body.document_id.trim() : '';
  const tenantId =
    typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';

  if (!documentId) {
    return res.status(400).json({ error: 'document_id is required', code: 'MISSING_FIELD' });
  }
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_id is required', code: 'MISSING_FIELD' });
  }

  // ── Ensure the background poller is running ────────────────────────────────
  // Idempotent — no-op after the first call.
  ensureSchedulerRunning();

  // ── Respond immediately ────────────────────────────────────────────────────
  // Send 200 BEFORE kicking off background work.
  // This ensures the CMS receives its response in < 1 second regardless of
  // how long document processing takes.
  res.status(200).json({ accepted: true });

  logRequest({
    component: COMPONENT,
    method:    req.method,
    path:      '/api/process',
    status:    200,
    ip,
    tenantId,
    durationMs: Date.now() - startMs,
  });

  log.info('Push notification accepted', { tenantId, documentId });

  // ── Dispatch background processing ────────────────────────────────────────
  dispatchById(documentId, tenantId);
}
