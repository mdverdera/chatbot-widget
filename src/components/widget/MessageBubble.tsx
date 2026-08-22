'use client';

import React from 'react';
import type { Message } from '@/types/widget';
import { formatTimestamp } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex w-full mb-3 animate-slide-up ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Bot avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-widget-primary flex items-center justify-center mr-2 mt-1">
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
      )}

      <div
        className={`flex flex-col max-w-[78%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
            isUser
              ? 'bg-widget-primary text-white rounded-br-sm'
              : 'bg-widget-bubble-bot text-widget-bubble-bot-text rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>
        <span className="text-[10px] text-widget-muted mt-1 px-1">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-widget-surface-2 flex items-center justify-center ml-2 mt-1">
          <svg
            className="w-4 h-4 text-widget-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
