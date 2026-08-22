/**
 * Widget configuration constants.
 * All values here are safe to expose in the browser bundle.
 */

export const WIDGET_DEFAULTS = {
  botName: 'Assistant',
  greeting: 'Hi there! 👋 How can I help you today?',
  position: 'bottom-right' as const,
  primaryColor: '#2563eb',
} satisfies {
  botName: string;
  greeting: string;
  position: 'bottom-right' | 'bottom-left';
  primaryColor: string;
};

/** Maximum number of messages rendered in the chat window at once. */
export const MAX_VISIBLE_MESSAGES = 100;

/** Milliseconds the mock "bot is typing" indicator is shown. */
export const MOCK_RESPONSE_DELAY_MS = 800;

/** API base path — resolved at runtime so it works in any deployment. */
export const API_BASE_PATH = '/api';
