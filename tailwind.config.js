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
          primary: '#2563eb',
          'primary-hover': '#1d4ed8',
          'primary-light': '#eff6ff',
          surface: '#ffffff',
          border: '#e5e7eb',
          muted: '#6b7280',
          bubble: {
            user: '#2563eb',
            bot: '#f3f4f6',
          },
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
