import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCmsAuth } from '@/lib/cms-auth';
import { removeDocumentKnowledge } from '@/lib/knowledge-processor';
import type { DeleteDocumentResponse } from '@/types/knowledge';
import type { ApiErrorResponse } from '@/types/widget';

/**
 * DELETE /api/knowledge/[documentId]?tenantId=<tenantId>
 *
 * Removes all vector chunks stored for the given document.
 * Called by the CMS when a knowledge document is deleted.
 *
 * Authentication:
 *   Bearer <CMS_API_SECRET> in the Authorization header.
 *
 * Query parameters:
 *   documentId  — path segment (the CMS document ID)
 *   tenantId    — required query parameter (owning tenant)
 *
 * Response 200:
 *   { documentId, tenantId, deletedChunks }
 *
 * Response 404:
 *   Returned when no vectors are found for the given documentId/tenantId
 *   combination.  This is informational — the CMS should proceed with its
 *   own deletion regardless.
 *
 * Security:
 *   - CMS_API_SECRET must match — 401 otherwise.
 *   - tenantId is verified against the secret before any deletion occurs.
 *   - Only vectors for the authenticated tenantId are touched.
 */

type ResponseBody = DeleteDocumentResponse | ApiErrorResponse;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  // ── Extract documentId from the URL path ───────────────────────────────────
  const { documentId } = req.query;
  if (typeof documentId !== 'string' || !documentId.trim()) {
    return res.status(400).json({ error: 'documentId path parameter is required', code: 'MISSING_FIELD' });
  }

  // tenantId is passed as a query string parameter (no body on DELETE).
  const tenantIdParam = req.query.tenantId;

  // ── CMS authentication ─────────────────────────────────────────────────────
  const auth = requireCmsAuth(req, res, tenantIdParam);
  if (!auth) return;   // 401 already sent.

  const { tenantId } = auth;

  // ── Delete vectors ─────────────────────────────────────────────────────────
  const deletedChunks = removeDocumentKnowledge(documentId.trim(), tenantId);

  if (deletedChunks === 0) {
    return res.status(404).json({
      error: 'No vectors found for this document / tenant combination',
      code:  'NOT_FOUND',
    });
  }

  return res.status(200).json({
    documentId: documentId.trim(),
    tenantId,
    deletedChunks,
  });
}
