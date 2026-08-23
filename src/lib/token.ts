/**
 * Token utilities — server-side only.
 *
 * Issues and verifies short-lived signed JWTs used to authenticate
 * chatbot API requests.  The signing secret is read from WIDGET_SECRET
 * and is NEVER exposed to the browser.
 *
 * Token lifecycle:
 *   1. CMS page load → POST /api/auth/widget-token
 *      Server validates Widget ID + Origin, issues JWT (TTL: TOKEN_TTL_SECONDS).
 *   2. Widget sends chat message → POST /api/chat/message
 *      Server verifies JWT: signature, expiry, widgetId claim, and origin claim.
 *
 * NEVER import this module from client-side code.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// ── Config ───────────────────────────────────────────────────────────────────

/** TTL for issued tokens (5 minutes). Short enough to limit replay windows. */
export const TOKEN_TTL_SECONDS = 5 * 60;

function getSecret(): Uint8Array {
  const secret = process.env.WIDGET_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      'WIDGET_SECRET environment variable is not set or is too short (min 32 chars). ' +
        'Set it in .env.local.',
    );
  }
  return new TextEncoder().encode(secret.trim());
}

// ── Token payload ─────────────────────────────────────────────────────────────

export interface WidgetTokenPayload extends JWTPayload {
  /** The widget ID this token was issued for. */
  wid: string;
  /** The normalised origin that requested the token. */
  org: string;
  /**
   * The CMS tenant that owns this widget.
   * Carried in the JWT so every downstream handler can scope knowledge
   * retrieval to the correct tenant without an extra registry lookup.
   */
  tid: string;
}

// ── Issue ────────────────────────────────────────────────────────────────────

/**
 * Sign a new short-lived token for a validated widget + origin + tenant triple.
 * Call this only from server-side code after passing origin validation.
 */
export async function issueWidgetToken(
  widgetId: string,
  origin: string,
  tenantId: string,
): Promise<string> {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ wid: widgetId, org: origin.toLowerCase(), tid: tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .setAudience('chatbot-api')
    .setIssuer('chatbot-cms')
    .sign(secret);
}

// ── Verify ───────────────────────────────────────────────────────────────────

export type TokenVerifyResult =
  | { valid: false; reason: string }
  | { valid: true; payload: WidgetTokenPayload };

/**
 * Verify a token presented by the widget on each API call.
 *
 * Checks:
 *   - HMAC-SHA-256 signature
 *   - Expiration (`exp` claim)
 *   - Issuer and audience
 *   - `wid` claim matches the widgetId in the request body
 *   - `org` claim matches the `Origin` header of the current request
 *   - `tid` claim is present (non-empty tenantId)
 */
export async function verifyWidgetToken(
  token: string,
  expectedWidgetId: string,
  requestOrigin: string | undefined,
): Promise<TokenVerifyResult> {
  if (!token) {
    return { valid: false, reason: 'Missing token' };
  }

  let payload: WidgetTokenPayload;
  try {
    const result = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
      audience: 'chatbot-api',
      issuer: 'chatbot-cms',
    });
    payload = result.payload as WidgetTokenPayload;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token verification failed';
    return { valid: false, reason: msg };
  }

  // Bind token to the widget ID in the request body
  if (payload.wid !== expectedWidgetId) {
    return { valid: false, reason: 'Token widget ID mismatch' };
  }

  // Bind token to the origin that requested it
  const origin = (requestOrigin ?? '').trim().toLowerCase();
  if (!origin || payload.org !== origin) {
    return { valid: false, reason: 'Token origin mismatch' };
  }

  // Ensure tenantId claim is present
  if (!payload.tid || typeof payload.tid !== 'string' || !payload.tid.trim()) {
    return { valid: false, reason: 'Token missing tenantId claim' };
  }

  return { valid: true, payload };
}
