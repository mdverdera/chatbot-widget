import type { NextApiRequest, NextApiResponse } from 'next';
import { validateWidgetOrigin } from '@/lib/widget-registry';
import { issueWidgetToken, TOKEN_TTL_SECONDS } from '@/lib/token';
import { checkRateLimit } from '@/lib/rate-limiter';
import { setCorsOrigin } from '@/lib/cors';
import { createLogger, logRequest, logAuthFailure } from '@/lib/logger';
import { monitorAuthFailure } from '@/lib/monitoring';
import type { ApiErrorResponse } from '@/types/widget';

/**
 * POST /api/auth/widget-token
 *
 * Issues a short-lived signed JWT for an authorised widget + origin pair.
 * This endpoint is called by the widget (inside its iframe) before sending
 * any chat messages.
 *
 * Security model:
 *   - Validates that the Widget ID is registered and active in the registry.
 *   - Validates that the requesting Origin is on the widget's allowlist.
 *   - Rate-limits by Widget ID to prevent token-farming.
 *   - The returned JWT is signed with WIDGET_SECRET (never exposed to the browser).
 *   - The JWT binds to both the widgetId and the origin — tokens cannot be
 *     replayed from a different origin or against a different widget.
 *
 * Error responses:
 *   - All error messages are safe (no stack traces, no internal details).
 *
 * Request body: { widgetId: string }
 * Response:     { token: string; expiresIn: number }
 */

const COMPONENT = 'auth/widget-token';
const log = createLogger(COMPONENT);

interface TokenResponse {
  token: string;
  /** Seconds until the token expires. */
  expiresIn: number;
}

// Rate-limit: max 30 token requests per widgetId per minute.
const TOKEN_RATE_LIMIT   = 30;
const TOKEN_RATE_WINDOW  = 60 * 1000; // 1 minute

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenResponse | ApiErrorResponse>,
) {
  const startMs = Date.now();

  // ── CORS pre-flight ───────────────────────────────────────────────────────
  // For OPTIONS we can't validate the widgetId (body not sent), so we permit
  // the pre-flight and let the actual POST enforce the full check.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  // ── Extract inputs ────────────────────────────────────────────────────────
  const body     = req.body as { widgetId?: unknown };
  const widgetId = typeof body.widgetId === 'string' ? body.widgetId.trim() : '';
  const origin   = req.headers.origin;

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown';

  if (!widgetId) {
    return res
      .status(400)
      .json({ error: 'widgetId is required', code: 'MISSING_WIDGET_ID' });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateKey = `token:${widgetId}`;
  const rate    = checkRateLimit(rateKey, TOKEN_RATE_LIMIT, TOKEN_RATE_WINDOW);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    log.warn('Rate limit exceeded for token request', { widgetId, ip });
    return res.status(429).json({
      error: 'Too many token requests. Please slow down.',
      code: 'RATE_LIMITED',
    });
  }

  // ── Widget ID + origin validation ─────────────────────────────────────────
  const validation = validateWidgetOrigin(widgetId, origin);
  if (!validation.valid) {
    logAuthFailure(COMPONENT, validation.reason, { widgetId, origin: origin ?? 'none', ip });
    monitorAuthFailure(COMPONENT, validation.reason);
    // Intentionally vague to avoid leaking registry information.
    return res.status(403).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  // ── Issue token ───────────────────────────────────────────────────────────
  try {
    // Pass tenantId from the registry record so it travels inside the JWT.
    // The chat handler extracts it from the verified token to scope RAG retrieval.
    const token = await issueWidgetToken(widgetId, origin!, validation.record.tenantId);
    // Set origin-bound CORS header only for the validated origin.
    setCorsOrigin(req, res, widgetId);

    logRequest({
      component: COMPONENT,
      method:    req.method!,
      path:      '/api/auth/widget-token',
      status:    200,
      ip,
      widgetId,
      tenantId:  validation.record.tenantId,
      durationMs: Date.now() - startMs,
    });

    return res.status(200).json({ token, expiresIn: TOKEN_TTL_SECONDS });
  } catch (err) {
    log.error('Failed to issue token', { widgetId }, err);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'SERVER_ERROR',
    });
  }
}
