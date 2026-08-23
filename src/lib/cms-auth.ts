/**
 * CMS inbound authentication — server-side only.
 *
 * Validates requests that arrive FROM the CMS into this chatbot service.
 * The CMS authenticates by sending the shared secret as a Bearer token:
 *
 *   Authorization: Bearer <CHATBOT_API_SECRET>
 *
 * Secret naming convention:
 *   CHATBOT_API_SECRET  — the secret the CMS sends to THIS service (inbound).
 *                         Set this on the chatbot side to match what the CMS sends.
 *   CMS_API_SECRET      — the secret THIS service sends to the CMS (outbound).
 *                         Used by cms-client.ts for GET/PATCH calls to the CMS.
 *
 * The two values may be equal in a simple deployment (one shared secret) or
 * different if you want directional secrets.  The names intentionally reflect
 * direction rather than identity.
 *
 * Security model:
 *   - One shared secret covers all tenants (the CMS manages multi-tenancy).
 *   - The tenantId in the payload is trusted only after the secret is verified.
 *   - If the secret is missing, wrong, or the tenantId is blank → reject.
 *   - Comparison is constant-time to prevent timing attacks.
 *
 * NEVER import this module from client-side code.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { ApiErrorResponse } from '@/types/widget';

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Returns the secret used to validate INBOUND calls from the CMS.
 * Reads CHATBOT_API_SECRET with a fallback to CMS_API_SECRET for
 * backward-compatibility with deployments that use a single shared secret.
 */
function getInboundSecret(): string {
  const secret =
    process.env.CHATBOT_API_SECRET?.trim() ||
    process.env.CMS_API_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'CHATBOT_API_SECRET environment variable is not set. Set it in .env.local.',
    );
  }
  return secret;
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
 * Verify that a request comes from the CMS (valid inbound secret) and extract
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
    secret = getInboundSecret();
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

/**
 * Authenticate a request that carries no tenantId (e.g. pure push notifications
 * where the tenantId is in the body and validated separately).
 * Only validates the Bearer secret — does NOT require tenantId.
 */
export function requireCmsSecretOnly(
  req: NextApiRequest,
  res: NextApiResponse<ApiErrorResponse>,
): boolean {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return false;
  }
  let secret: string;
  try {
    secret = getInboundSecret();
  } catch {
    res.status(500).json({ error: 'Server misconfiguration', code: 'SERVER_ERROR' });
    return false;
  }
  if (!safeEqual(token, secret)) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}
