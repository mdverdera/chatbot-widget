/**
 * Widget configuration constants.
 * All values here are safe to expose in the browser bundle.
 */

export const WIDGET_DEFAULTS = {
  botName: 'Assistant',
  greeting: 'Hi there! 👋 How can I help you today?',
  position: 'bottom-right' as const,
  primaryColor: '#2563eb',
  theme: 'light' as const,
} satisfies {
  botName: string;
  greeting: string;
  position: 'bottom-right' | 'bottom-left';
  primaryColor: string;
  theme: 'light' | 'dark' | 'auto';
};

/**
 * Design tokens for light and dark themes.
 * All values are injected as CSS custom properties by ChatWidget so every
 * child component picks them up via Tailwind's `bg-widget-*` utilities —
 * no prop drilling required.
 */
export const THEME_TOKENS = {
  light: {
    '--widget-surface':      '#ffffff',
    '--widget-surface-2':    '#f3f4f6',
    '--widget-border':       '#e5e7eb',
    '--widget-text':         '#111827',
    '--widget-text-muted':   '#6b7280',
    '--widget-bubble-bot-bg':'#f3f4f6',
    '--widget-bubble-bot-fg':'#111827',
    '--widget-input-bg':     '#ffffff',
    '--widget-error-bg':     '#fef2f2',
    '--widget-error-border': '#fecaca',
    '--widget-error-text':   '#dc2626',
  },
  dark: {
    '--widget-surface':      '#1f2937',
    '--widget-surface-2':    '#111827',
    '--widget-border':       '#374151',
    '--widget-text':         '#f9fafb',
    '--widget-text-muted':   '#9ca3af',
    '--widget-bubble-bot-bg':'#374151',
    '--widget-bubble-bot-fg':'#f9fafb',
    '--widget-input-bg':     '#111827',
    '--widget-error-bg':     '#450a0a',
    '--widget-error-border': '#991b1b',
    '--widget-error-text':   '#fca5a5',
  },
} as const;

/** Maximum number of messages rendered in the chat window at once. */
export const MAX_VISIBLE_MESSAGES = 100;

/** Milliseconds the mock "bot is typing" indicator is shown. */
export const MOCK_RESPONSE_DELAY_MS = 800;

/** API base path — resolved at runtime so it works in any deployment. */
export const API_BASE_PATH = '/api';
