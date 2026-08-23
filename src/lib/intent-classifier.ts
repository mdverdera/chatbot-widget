/**
 * Intent classifier — server-side only.
 *
 * A fast, zero-cost, rule-based classifier that runs BEFORE the RAG pipeline.
 * Its job is to intercept messages that should never reach the Embeddings API
 * or the LLM, and handle them with a canned response instead.
 *
 * Intercepted intent categories:
 *
 *   greeting     — "hi", "hello", "hey", "good morning", etc.
 *   farewell     — "bye", "goodbye", "see you", "take care", etc.
 *   gratitude    — "thanks", "thank you", "cheers", etc.
 *   affirmation  — "ok", "okay", "sure", "got it", "sounds good", etc.
 *   bot-identity — "who are you", "what are you", "are you a bot", etc.
 *
 * All other messages (i.e. actual questions or statements) return
 * intent = 'question' and are forwarded to the full RAG pipeline.
 *
 * Design constraints:
 *   - Zero external calls — purely in-process string matching.
 *   - Normalise before matching: lowercase + strip punctuation + collapse spaces.
 *   - Exact-token sets for short messages (≤ 8 words) — avoids false positives
 *     on messages like "Hello, can you tell me about your return policy?"
 *     which must reach the RAG pipeline.
 *   - Phrase-prefix matching for multi-word conversational openers.
 *
 * NEVER import this module from client-side code.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageIntent =
  | 'greeting'
  | 'farewell'
  | 'gratitude'
  | 'affirmation'
  | 'bot-identity'
  | 'question';

export interface IntentResult {
  intent: MessageIntent;
  /**
   * A ready-to-send reply for non-question intents.
   * `undefined` when intent === 'question' — the RAG pipeline provides the reply.
   */
  reply?: string;
}

// ── Canned responses ──────────────────────────────────────────────────────────

const REPLIES: Record<Exclude<MessageIntent, 'question'>, string> = {
  greeting:
    "Hello! 👋 How can I help you today? Feel free to ask me anything about our products or services.",
  farewell:
    "Goodbye! Have a great day. Don't hesitate to come back if you have more questions. 😊",
  gratitude:
    "You're welcome! Is there anything else I can help you with?",
  affirmation:
    "Great! Is there anything else you'd like to know?",
  'bot-identity':
    "I'm a virtual assistant here to answer your questions based on our knowledge base. How can I help you?",
};

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Normalise a message for matching:
 *   - Lowercase
 *   - Strip leading/trailing punctuation and whitespace
 *   - Collapse internal whitespace to single spaces
 *   - Remove common filler punctuation (!, ?, ., ,) so "hi!" matches "hi"
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[!?.,'"\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Pattern tables ────────────────────────────────────────────────────────────

/**
 * Short exact matches (normalised full message).
 * Only applied when the message is ≤ 8 words, preventing false positives
 * on longer messages that happen to start with a social word.
 */
const EXACT_MATCHES: Map<string, Exclude<MessageIntent, 'question'>> = new Map([
  // Greetings
  ['hi',               'greeting'],
  ['hey',              'greeting'],
  ['hello',            'greeting'],
  ['hiya',             'greeting'],
  ['howdy',            'greeting'],
  ['sup',              'greeting'],
  ['yo',               'greeting'],
  ['good morning',     'greeting'],
  ['good afternoon',   'greeting'],
  ['good evening',     'greeting'],
  ['good day',         'greeting'],
  ['hi there',         'greeting'],
  ['hey there',        'greeting'],
  ['hello there',      'greeting'],
  ['greetings',        'greeting'],
  ['what s up',        'greeting'],  // "what's up" after normalise
  ['how are you',      'greeting'],
  ['how are you doing','greeting'],
  ['how s it going',   'greeting'],  // "how's it going"
  ['how do you do',    'greeting'],
  ['nice to meet you', 'greeting'],

  // Farewells
  ['bye',              'farewell'],
  ['bye bye',          'farewell'],
  ['goodbye',          'farewell'],
  ['good bye',         'farewell'],
  ['see you',          'farewell'],
  ['see ya',           'farewell'],
  ['later',            'farewell'],
  ['take care',        'farewell'],
  ['have a good day',  'farewell'],
  ['have a great day', 'farewell'],
  ['cya',              'farewell'],
  ['talk later',       'farewell'],
  ['talk to you later','farewell'],
  ['ttyl',             'farewell'],
  ['good night',       'farewell'],
  ['goodnight',        'farewell'],

  // Gratitude
  ['thanks',           'gratitude'],
  ['thank you',        'gratitude'],
  ['thank you so much','gratitude'],
  ['thanks a lot',     'gratitude'],
  ['thanks so much',   'gratitude'],
  ['many thanks',      'gratitude'],
  ['much appreciated', 'gratitude'],
  ['cheers',           'gratitude'],
  ['thx',              'gratitude'],
  ['ty',               'gratitude'],
  ['tysm',             'gratitude'],

  // Affirmations
  ['ok',               'affirmation'],
  ['okay',             'affirmation'],
  ['ok thanks',        'affirmation'],
  ['okay thanks',      'affirmation'],
  ['sure',             'affirmation'],
  ['got it',           'affirmation'],
  ['got it thanks',    'affirmation'],
  ['sounds good',      'affirmation'],
  ['perfect',          'affirmation'],
  ['great',            'affirmation'],
  ['awesome',          'affirmation'],
  ['cool',             'affirmation'],
  ['alright',         'affirmation'],
  ['understood',       'affirmation'],
  ['makes sense',      'affirmation'],
  ['noted',            'affirmation'],

  // Bot identity
  ['who are you',              'bot-identity'],
  ['what are you',             'bot-identity'],
  ['are you a bot',            'bot-identity'],
  ['are you a robot',          'bot-identity'],
  ['are you human',            'bot-identity'],
  ['are you real',             'bot-identity'],
  ['are you an ai',            'bot-identity'],
  ['are you chatgpt',          'bot-identity'],
  ['what is your name',        'bot-identity'],
  ['what s your name',         'bot-identity'],
  ['whats your name',          'bot-identity'],
  ['tell me about yourself',   'bot-identity'],
  ['who made you',             'bot-identity'],
  ['what can you do',          'bot-identity'],
  ['what do you do',           'bot-identity'],
]);

/**
 * Prefix matches — applied regardless of message length.
 * These catch longer messages whose *opening* is purely social.
 * Order matters: more specific prefixes first.
 */
const PREFIX_MATCHES: Array<[string, Exclude<MessageIntent, 'question'>]> = [
  ['good morning ',    'greeting'],
  ['good afternoon ',  'greeting'],
  ['good evening ',    'greeting'],
  ['hey there ',       'greeting'],
  ['hi there ',        'greeting'],
  ['hello there ',     'greeting'],
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify the intent of a user message.
 *
 * Returns instantly with no I/O.  The caller should check `result.intent`:
 *   - If `'question'`  → run the RAG pipeline.
 *   - Otherwise        → return `result.reply` directly to the user.
 *
 * @param message - Raw user message (pre-validated, max 2000 chars).
 */
export function classifyIntent(message: string): IntentResult {
  const norm      = normalise(message);
  const wordCount = norm.split(' ').filter(Boolean).length;

  // ── 1. Prefix check (any length) ─────────────────────────────────────────
  for (const [prefix, intent] of PREFIX_MATCHES) {
    if (norm.startsWith(prefix)) {
      return { intent, reply: REPLIES[intent] };
    }
  }

  // ── 2. Exact match (short messages only, ≤ 8 words) ──────────────────────
  if (wordCount <= 8) {
    const match = EXACT_MATCHES.get(norm);
    if (match) {
      return { intent: match, reply: REPLIES[match] };
    }
  }

  // ── 3. Default: send to RAG pipeline ─────────────────────────────────────
  return { intent: 'question' };
}
