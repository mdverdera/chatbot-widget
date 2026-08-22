'use client';

import React from 'react';

/**
 * Animated three-dot "bot is typing" indicator.
 */
export function TypingIndicator() {
  return (
    <div className="flex items-center mb-3 animate-fade-in">
      {/* Bot avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-widget-primary flex items-center justify-center mr-2">
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z"
          />
        </svg>
      </div>

      <div className="bg-widget-bubble-bot px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 bg-widget-muted rounded-full animate-typing"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
