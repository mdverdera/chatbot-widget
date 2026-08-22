import type { NextApiRequest, NextApiResponse } from 'next';
import { validateWidgetOrigin } from '@/lib/widget-registry';
import { issueWidgetToken, TOKEN_TTL_SECONDS } from '@/lib/token';
import { checkRateLimit } from '@/lib/rate-limiter';
import { setCorsOrigin } from '@/lib/cors';
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
 * Request body: { widgetId: string }
 * Response:     { token: string; expiresIn: number }
 */

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
    return res.status(429).json({
      error: 'Too many token requests. Please slow down.',
      code: 'RATE_LIMITED',
    });
  }

  // ── Widget ID + origin validation ─────────────────────────────────────────
  const validation = validateWidgetOrigin(widgetId, origin);
  if (!validation.valid) {
    // Intentionally vague to avoid leaking registry information.
    return res.status(403).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  // ── Issue token ───────────────────────────────────────────────────────────
  try {
    const token = await issueWidgetToken(widgetId, origin!);
    // Set origin-bound CORS header only for the validated origin.
    setCorsOrigin(req, res, widgetId);
    return res.status(200).json({ token, expiresIn: TOKEN_TTL_SECONDS });
  } catch (err) {
    console.error('[widget-token] Failed to issue token:', err);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'SERVER_ERROR',
    });
  }
}
