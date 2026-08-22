'use client';

import React from 'react';

interface ChatButtonProps {
  isOpen: boolean;
  onClick: () => void;
  ariaLabel?: string;
}

/**
 * Floating action button that toggles the chat window open/closed.
 * Renders a chat icon when closed and an X icon when open.
 * Colour is inherited from the --widget-primary CSS variable set by ChatWidget.
 */
export function ChatButton({
  isOpen,
  onClick,
  ariaLabel = 'Open chat',
}: ChatButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Close chat' : ariaLabel}
      aria-expanded={isOpen}
      className="w-14 h-14 rounded-full bg-widget-primary hover:bg-widget-primary-hover shadow-button flex items-center justify-center transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-widget-primary active:scale-95 relative"
    >
      {/* X icon — visible when open */}
      <span
        className={`absolute transition-all duration-200 ${
          isOpen
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 rotate-90 scale-75'
        }`}
        aria-hidden="true"
      >
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </span>

      {/* Chat bubble icon — visible when closed */}
      <span
        className={`absolute transition-all duration-200 ${
          !isOpen
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 -rotate-90 scale-75'
        }`}
        aria-hidden="true"
      >
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z"
          />
        </svg>
      </span>
    </button>
  );
}
