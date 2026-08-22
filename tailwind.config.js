/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        widget: {
          // ── Accent (set by CMS primaryColor) ──────────────────────────────
          primary:         'var(--widget-primary, #2563eb)',
          'primary-hover': 'var(--widget-primary-hover, #1d4ed8)',
          'primary-light': 'var(--widget-primary-light, #eff6ff)',
          // ── Theme surfaces/text (set by light/dark/auto theme) ────────────
          surface:         'var(--widget-surface, #ffffff)',
          'surface-2':     'var(--widget-surface-2, #f3f4f6)',
          border:          'var(--widget-border, #e5e7eb)',
          text:            'var(--widget-text, #111827)',
          muted:           'var(--widget-text-muted, #6b7280)',
          'input-bg':      'var(--widget-input-bg, #ffffff)',
          // ── Bubbles ───────────────────────────────────────────────────────
          bubble: {
            user:  'var(--widget-primary, #2563eb)',
            bot:   'var(--widget-bubble-bot-bg, #f3f4f6)',
            'bot-text': 'var(--widget-bubble-bot-fg, #111827)',
          },
          // ── Error state ───────────────────────────────────────────────────
          'error-bg':     'var(--widget-error-bg, #fef2f2)',
          'error-border': 'var(--widget-error-border, #fecaca)',
          'error-text':   'var(--widget-error-text, #dc2626)',
        },
      },
      boxShadow: {
        widget: '0 8px 30px rgba(0, 0, 0, 0.12)',
        button: '0 4px 14px rgba(37, 99, 235, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        typing: 'typing 1s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        typing: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
