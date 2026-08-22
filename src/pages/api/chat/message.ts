import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import type {
  SendMessageRequest,
  SendMessageResponse,
  ApiErrorResponse,
} from '@/types/widget';
import { MOCK_RESPONSE_DELAY_MS } from '@/lib/constants';

// ──────────────────────────────────────────────
// Mock response logic
// Phase 2+: replace this with an LLM / CMS-backed handler.
// ──────────────────────────────────────────────

const MOCK_RESPONSES: string[] = [
  "Thanks for your message! I'm a demo assistant — real AI responses are coming soon.",
  "That's a great question. Our team will be able to help you with that shortly.",
  "I've noted your query. Is there anything else you'd like to know?",
  "Sure! Let me look that up for you. (This is a mock response for now.)",
  "Interesting! Could you tell me a bit more about what you're looking for?",
  "Got it! In a future version I'll connect to a live knowledge base to answer that properly.",
];

function getMockReply(userMessage: string): string {
  // Simple deterministic hash so the same input always returns the same mock.
  let hash = 0;
  for (let i = 0; i < userMessage.length; i++) {
    hash = (hash * 31 + userMessage.charCodeAt(i)) >>> 0;
  }
  return MOCK_RESPONSES[hash % MOCK_RESPONSES.length];
}

// ──────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendMessageResponse | ApiErrorResponse>,
) {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

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

  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim().length > 0
      ? body.sessionId
      : uuidv4();

  // Simulate processing time (remove in Phase 2 once a real service is wired in)
  await new Promise<void>((resolve) =>
    setTimeout(resolve, MOCK_RESPONSE_DELAY_MS),
  );

  const reply = getMockReply(body.message);

  return res.status(200).json({
    reply,
    sessionId,
    messageId: uuidv4(),
    timestamp: Date.now(),
  });
}
