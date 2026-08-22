'use client';

import React, { useState, useCallback, useRef } from 'react';
import type { Message, WidgetConfig } from '@/types/widget';
import { createMessage, createSessionId } from '@/lib/utils';
import { sendMessage } from '@/lib/api-client';
import { WIDGET_DEFAULTS } from '@/lib/constants';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  config: WidgetConfig;
  onClose: () => void;
}

/**
 * The main chat window panel — manages session state, message history,
 * and communicates with the /api/chat/message endpoint.
 */
export function ChatWindow({ config, onClose }: ChatWindowProps) {
  const sessionIdRef = useRef<string>(createSessionId());

  const botName = config.botName ?? WIDGET_DEFAULTS.botName;
  const greeting = config.greeting ?? WIDGET_DEFAULTS.greeting;

  const [messages, setMessages] = useState<Message[]>(() => [
    createMessage('bot', greeting),
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(
    async (text: string) => {
      setError(null);

      // Optimistically append the user message
      const userMsg = createMessage('user', text);
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        const response = await sendMessage({
          widgetId: config.widgetId,
          sessionId: sessionIdRef.current,
          message: text,
        });

        // Persist the session ID returned by the server
        sessionIdRef.current = response.sessionId;

        const botMsg: Message = {
          id: response.messageId,
          role: 'bot',
          content: response.reply,
          timestamp: response.timestamp,
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
        );
      } finally {
        setIsTyping(false);
      }
    },
    [config.widgetId],
  );

  return (
    <div
      className="flex flex-col w-[360px] h-[520px] bg-widget-surface rounded-2xl shadow-widget overflow-hidden animate-slide-up"
      role="dialog"
      aria-modal="true"
      aria-label={`Chat with ${botName}`}
    >
      <ChatHeader botName={botName} onClose={onClose} />

      <MessageList messages={messages} isTyping={isTyping} />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-3 mb-2 px-3 py-2 bg-widget-error-bg border border-widget-error-border rounded-xl text-xs text-widget-error-text"
        >
          {error}
        </div>
      )}

      <MessageInput onSend={handleSend} isDisabled={isTyping} />
    </div>
  );
}
