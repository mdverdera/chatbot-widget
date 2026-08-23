/**
 * CMS tenant authentication — server-side only.
 *
 * All knowledge ingestion and management endpoints must be called by the CMS,
 * not by end users.  The CMS authenticates itself by sending the shared secret
 * as a Bearer token:
 *
 *   Authorization: Bearer <CMS_API_SECRET>
 *
 * This module validates that header and extracts the tenant ID from the
 * request body / query so every endpoint gets a verified tenantId without
 * duplicating the auth logic.
 *
 * Security model:
 *   - One shared secret covers all tenants (the CMS manages multi-tenancy).
 *   - The tenantId in the payload is trusted only after the secret is verified.
 *   - If the secret is missing, wrong, or the tenantId is blank → reject.
 *
 * NEVER import this module from client-side code.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { ApiErrorResponse } from '@/types/widget';

// ── Config ────────────────────────────────────────────────────────────────────

function getCmsApiSecret(): string {
  const secret = process.env.CMS_API_SECRET;
  if (!secret?.trim()) {
    throw new Error(
      'CMS_API_SECRET environment variable is not set. Set it in .env.local.',
    );
  }
  return secret.trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CmsAuthResult =
  | { authenticated: false; reason: string }
  | { authenticated: true; tenantId: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the Bearer token from the Authorization header. */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}

/** Constant-time string comparison to prevent timing attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify that a request comes from the CMS (valid shared secret) and extract
 * the tenant ID from the provided value.
 *
 * @param req       - Incoming Next.js API request.
 * @param tenantId  - The tenantId the caller claims in the request body/query.
 *                    This is trusted only AFTER the secret is verified.
 */
export function authenticateCmsRequest(
  req: NextApiRequest,
  tenantId: unknown,
): CmsAuthResult {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return { authenticated: false, reason: 'Missing Authorization header' };
  }

  let secret: string;
  try {
    secret = getCmsApiSecret();
  } catch {
    return { authenticated: false, reason: 'Server misconfiguration' };
  }

  if (!safeEqual(token, secret)) {
    return { authenticated: false, reason: 'Invalid secret' };
  }

  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    return { authenticated: false, reason: 'tenantId is required' };
  }

  return { authenticated: true, tenantId: tenantId.trim() };
}

/**
 * Convenience: authenticate and reject the request inline.
 * Returns `null` when auth passes (caller can continue).
 * Returns a response (already sent) when auth fails — caller must return early.
 *
 * Usage:
 *   const auth = requireCmsAuth(req, res, body.tenantId);
 *   if (!auth) return;
 *   // auth.tenantId is now verified
 */
export function requireCmsAuth(
  req: NextApiRequest,
  res: NextApiResponse<ApiErrorResponse>,
  tenantId: unknown,
): { tenantId: string } | null {
  const result = authenticateCmsRequest(req, tenantId);
  if (!result.authenticated) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return null;
  }
  return { tenantId: result.tenantId };
}
