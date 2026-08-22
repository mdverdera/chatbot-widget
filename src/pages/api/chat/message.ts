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
import { MOCK_RESPONSE_DELAY_MS } from '@/lib/constants';

/**
 * POST /api/chat/message
 *
 * Phase 3 security:
 *   - Requires a valid Bearer token in the Authorization header.
 *   - Token is verified: signature (HMAC-SHA-256), expiry, widgetId binding,
 *     and origin binding.
 *   - Rate-limited per IP to prevent abuse.
 *   - Requests with missing / invalid tokens are rejected with 401.
 *
 * Phase 4+: replace mock response logic with a real LLM call.
 */

// ── Mock response logic ───────────────────────────────────────────────────────
// Phase 4+: replace this block with an LLM / CMS-backed handler.

const MOCK_RESPONSES: string[] = [
  "Thanks for your message! I'm a demo assistant — real AI responses are coming soon.",
  "That's a great question. Our team will be able to help you with that shortly.",
  "I've noted your query. Is there anything else you'd like to know?",
  "Sure! Let me look that up for you. (This is a mock response for now.)",
  "Interesting! Could you tell me a bit more about what you're looking for?",
  "Got it! In a future version I'll connect to a live knowledge base to answer that properly.",
];

function getMockReply(userMessage: string): string {
  let hash = 0;
  for (let i = 0; i < userMessage.length; i++) {
    hash = (hash * 31 + userMessage.charCodeAt(i)) >>> 0;
  }
  return MOCK_RESPONSES[hash % MOCK_RESPONSES.length]!;
}

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

// ── Rate-limit config ─────────────────────────────────────────────────────────
// 60 messages per IP per minute.
const CHAT_RATE_LIMIT  = 60;
const CHAT_RATE_WINDOW = 60 * 1000; // 1 minute

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendMessageResponse | ApiErrorResponse>,
) {
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
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown';

  const rate = checkRateLimit(`chat:${ip}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
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
    return res
      .status(401)
      .json({ error: 'Authorization token required', code: 'MISSING_TOKEN' });
  }

  const tokenResult = await verifyWidgetToken(token, body.widgetId, origin);
  if (!tokenResult.valid) {
    return res
      .status(401)
      .json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  // ── Handle session ID ─────────────────────────────────────────────────────
  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim().length > 0
      ? body.sessionId
      : uuidv4();

  // ── Mock response (Phase 4+: replace with LLM call) ──────────────────────
  await new Promise<void>((resolve) =>
    setTimeout(resolve, MOCK_RESPONSE_DELAY_MS),
  );

  const reply = getMockReply(body.message);

  // Set origin-bound CORS header only for the validated origin.
  setCorsOrigin(req, res, body.widgetId);

  return res.status(200).json({
    reply,
    sessionId,
    messageId: uuidv4(),
    timestamp: Date.now(),
  });
}
