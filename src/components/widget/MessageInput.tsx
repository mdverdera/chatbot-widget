'use client';

import React, {
  useState,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

interface MessageInputProps {
  onSend: (text: string) => void;
  isDisabled?: boolean;
  placeholder?: string;
}

/**
 * Controlled text input bar for composing a message.
 * Sends on Enter (without Shift) or on button click.
 */
export function MessageInput({
  onSend,
  isDisabled = false,
  placeholder = 'Type a message…',
}: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isDisabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 px-3 py-3 border-t border-widget-border bg-widget-surface flex-shrink-0"
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={isDisabled}
        placeholder={placeholder}
        aria-label="Message input"
        className="flex-1 resize-none rounded-xl border border-widget-border bg-widget-input-bg px-3 py-2 text-sm text-widget-text placeholder-widget-muted focus:outline-none focus:ring-2 focus:ring-widget-primary focus:border-transparent disabled:opacity-50 max-h-[120px] leading-relaxed"
      />
      <button
        type="submit"
        disabled={!text.trim() || isDisabled}
        aria-label="Send message"
        className="flex-shrink-0 w-9 h-9 rounded-xl bg-widget-primary hover:bg-widget-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
      >
        <svg
          className="w-4 h-4 text-white translate-x-px"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        </svg>
      </button>
    </form>
  );
}
