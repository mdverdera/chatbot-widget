'use client';

import React from 'react';

interface ChatHeaderProps {
  botName: string;
  onClose: () => void;
}

/**
 * Top bar of the chat window — shows bot name and a close button.
 */
export function ChatHeader({ botName, onClose }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-widget-primary rounded-t-2xl">
      {/* Status dot + bot name */}
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full bg-green-400 animate-pulse"
          aria-hidden="true"
        />
        <span className="text-white font-semibold text-sm tracking-wide">
          {botName}
        </span>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close chat"
        className="text-blue-200 hover:text-white transition-colors rounded-lg p-1 hover:bg-white/10"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
