import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import type {
  SendMessageRequest,
  SendMessageResponse,
  ApiErrorResponse,
} from '@/types/widget';
import { verifyWidgetToken } from '@/lib/token';
import { checkRateLimit } from '@/lib/rate-limiter';
import { setCorsOrigin } from '@/lib/cors';
import { runRagPipeline } from '@/lib/rag-pipeline';
import { createLogger, logRequest, logAuthFailure } from '@/lib/logger';
import { monitorAuthFailure } from '@/lib/monitoring';

/**
 * POST /api/chat/message
 *
 * Receives a user message, verifies the widget JWT, extracts the tenant ID
 * from the token's `tid` claim, and runs the RAG pipeline to produce a
 * knowledge-grounded answer.
 *
 * Security:
 *   - Requires a valid Bearer token in the Authorization header.
 *   - Token is verified: signature (HMAC-SHA-256), expiry, widgetId binding,
 *     origin binding, and tenantId claim (`tid`).
 *   - Rate-limited per IP to prevent abuse.
 *   - Requests with missing / invalid tokens are rejected with 401.
 *
 * Tenant isolation:
 *   - The `tid` claim from the verified JWT is the sole source of tenantId.
 *   - It is NEVER taken from the request body or query string.
 *   - It is passed directly to runRagPipeline(), which forwards it to
 *     searchVectors() as a mandatory scope filter.
 *   - Cross-tenant knowledge retrieval is architecturally impossible.
 *
 * RAG flow:
 *   1. Embed the user's message.
 *   2. Search the tenant's vector store.
 *   3. If no chunk clears SIMILARITY_THRESHOLD → return FALLBACK_MESSAGE.
 *   4. Otherwise, inject context into system prompt → call LLM → return reply.
 *
 * Error responses:
 *   - All error messages are safe (no stack traces, no internal details).
 */

const COMPONENT = 'chat/message';
const log = createLogger(COMPONENT);

// ── Validation helpers ────────────────────────────────────────────────────────

function isValidWidgetId(widgetId: unknown): widgetId is string {
  return typeof widgetId === 'string' && widgetId.trim().length > 0;
}

function isValidMessage(message: unknown): message is string {
  return (
    typeof message === 'string' &&
    message.trim().length > 0 &&
    message.length <= 2000
  );
}

/** Extract the Bearer token from the Authorization header. */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}

/** Extract the client IP, preferring the leftmost forwarded address. */
function extractIp(req: NextApiRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown'
  );
}

// ── Rate-limit config ─────────────────────────────────────────────────────────
// 60 messages per IP per minute.
const CHAT_RATE_LIMIT  = 60;
const CHAT_RATE_WINDOW = 60 * 1000; // 1 minute

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendMessageResponse | ApiErrorResponse>,
) {
  const startMs = Date.now();
  const ip = extractIp(req);

  // ── CORS pre-flight ───────────────────────────────────────────────────────
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

  // ── Rate limit by IP ──────────────────────────────────────────────────────
  const rate = checkRateLimit(`chat:${ip}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    log.warn('Rate limit exceeded', { ip, remaining: 0 });
    return res.status(429).json({
      error: 'Too many requests. Please slow down.',
      code: 'RATE_LIMITED',
    });
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const body = req.body as Partial<SendMessageRequest>;

  if (!isValidWidgetId(body.widgetId)) {
    return res
      .status(400)
      .json({ error: 'widgetId is required', code: 'MISSING_WIDGET_ID' });
  }

  if (!isValidMessage(body.message)) {
    return res.status(400).json({
      error: 'message must be a non-empty string (max 2000 chars)',
      code: 'INVALID_MESSAGE',
    });
  }

  // ── Token verification ────────────────────────────────────────────────────
  const token  = extractBearerToken(req.headers.authorization);
  const origin = req.headers.origin;

  if (!token) {
    logAuthFailure(COMPONENT, 'Missing token', { widgetId: body.widgetId, ip });
    monitorAuthFailure(COMPONENT, 'Missing token');
    return res
      .status(401)
      .json({ error: 'Authorization token required', code: 'MISSING_TOKEN' });
  }

  const tokenResult = await verifyWidgetToken(token, body.widgetId, origin);
  if (!tokenResult.valid) {
    logAuthFailure(COMPONENT, tokenResult.reason, {
      widgetId: body.widgetId,
      origin:   origin ?? 'none',
      ip,
    });
    monitorAuthFailure(COMPONENT, tokenResult.reason);
    return res
      .status(401)
      .json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  // ── Extract tenantId from verified token ──────────────────────────────────
  // `tid` is guaranteed non-empty by verifyWidgetToken().
  // This is the sole source of tenantId — NEVER taken from the request body.
  const tenantId = tokenResult.payload.tid;

  // ── Handle session ID ─────────────────────────────────────────────────────
  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim().length > 0
      ? body.sessionId
      : uuidv4();

  // ── RAG pipeline ──────────────────────────────────────────────────────────
  // Embeds question → tenant-scoped vector search → LLM call (or fallback).
  let outcome;
  try {
    outcome = await runRagPipeline({
      tenantId,
      question: body.message,
    });
  } catch (err) {
    // runRagPipeline never throws, but guard against the unexpected.
    log.error('Unexpected error in RAG pipeline', { tenantId, widgetId: body.widgetId }, err);
    return res.status(500).json({
      error: 'An error occurred processing your request.',
      code: 'SERVER_ERROR',
    });
  }

  const durationMs = Date.now() - startMs;

  logRequest({
    component: COMPONENT,
    method:    req.method,
    path:      '/api/chat/message',
    status:    200,
    ip,
    tenantId,
    widgetId:  body.widgetId,
    durationMs,
  });

  if (outcome.status === 'answered') {
    log.info('Chat message answered', {
      tenantId,
      widgetId:   body.widgetId,
      chunksUsed: outcome.chunksUsed,
      durationMs,
    });
  } else if (outcome.status === 'error') {
    log.warn('Chat message pipeline error', {
      tenantId,
      widgetId: body.widgetId,
      durationMs,
    });
  } else {
    log.debug('Chat message handled', {
      tenantId,
      widgetId: body.widgetId,
      status:   outcome.status,
      durationMs,
    });
  }

  // Set origin-bound CORS header only for the validated origin.
  setCorsOrigin(req, res, body.widgetId);

  return res.status(200).json({
    reply:     outcome.reply,
    sessionId,
    messageId: uuidv4(),
    timestamp: Date.now(),
  });
}
